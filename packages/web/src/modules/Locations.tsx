import { formatDurationPrecise, type StoredRecord } from '@pluralnova/shared';
import { useAuth } from '../core/auth.js';
import { useCollection } from '../core/data.js';
import { useLiveSession } from '../core/liveSession.js';
import { useToast } from '../core/toast.js';
import { useI18n } from '../core/i18n.js';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Button, Card, Chip, IconButton } from '../ui/primitives.js';
import { DescriptiveNote } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';

/**
 * Places, recorded by hand — plus a short list of saved places that turn
 * starting a visit into one tap instead of typing the same name out again.
 *
 * Nothing is captured automatically. The coordinate fields exist for anyone who
 * wants them and are hidden entirely unless precise location has been turned on
 * in privacy settings.
 */
export default function Locations(): JSX.Element {
  const { term } = useI18n();
  const { settings } = useAuth();
  const toast = useToast();
  const precise = settings.privacy.allowPreciseLocation;

  const saved = useCollection('savedLocations', {
    sort: (a, b) => Number(a['sortOrder'] ?? 0) - Number(b['sortOrder'] ?? 0),
  });
  const visits = useCollection('locationEntries');
  const session = useLiveSession(visits, 'arrivedAt', 'leftAt');

  const manage = useDialog();
  const placeEditor = useDialog<StoredRecord>();
  const placeConfirm = useDialog<StoredRecord>();

  const activePlaceName =
    saved.items.find((place) => place.id === session.active?.['savedLocationId'])?.['name'] ??
    session.active?.['name'] ??
    'somewhere';

  const startSession = async (place: StoredRecord): Promise<void> => {
    try {
      const now = new Date().toISOString();
      await session.start({
        visitedAt: now,
        name: String(place['name']),
        savedLocationId: place.id,
        isCurrent: true,
      });
      toast.success(`Session started at ${String(place['name'])}`);
    } catch (cause) {
      toast.fromError(cause, 'Could not start the session');
    }
  };

  const stopSession = async (): Promise<void> => {
    try {
      await session.stop((durationSeconds) => ({
        isCurrent: false,
        durationMinutes: Math.round(durationSeconds / 60),
      }));
      toast.success('Session ended');
    } catch (cause) {
      toast.fromError(cause, 'Could not end the session');
    }
  };

  return (
    <>
      <CollectionScreen
        collection="locationEntries"
        description={
          session.active
            ? `At ${String(activePlaceName)} for ${formatDurationPrecise(session.elapsedSeconds)}.`
            : 'Somewhere you went, when, and who was out for it.'
        }
        emptyTitle="No places recorded"
        emptyBody={term('Useful alongside {{fronting}} — where someone was often explains a lot about a day.')}
        {...(precise ? {} : { formOmit: ['latitude', 'longitude', 'address'] })}
        newRecordDefaults={{ visitedAt: new Date().toISOString() }}
        headerActions={
          <Button variant="ghost" icon="settings" onClick={() => manage.show()}>
            Saved places
          </Button>
        }
        above={
          <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
            {session.active ? (
              <Card>
                <div className="row row--between">
                  <div>
                    <div style={{ fontWeight: 'var(--weight-semibold)' }}>At {String(activePlaceName)}</div>
                    <div className="tiny faint numeric">{formatDurationPrecise(session.elapsedSeconds)}</div>
                  </div>
                  <Button variant="secondary" size="sm" icon="pause" onClick={() => void stopSession()}>
                    Stop
                  </Button>
                </div>
              </Card>
            ) : saved.items.length > 0 ? (
              <div className="row">
                {saved.items.map((place) => (
                  <Chip key={place.id} onClick={() => void startSession(place)}>
                    {place['icon'] ? `${String(place['icon'])} ` : ''}
                    {String(place['name'])}
                  </Chip>
                ))}
              </div>
            ) : (
              <Card>
                <DescriptiveNote>
                  Add a saved place — home, work, anywhere you go often — to start a timed session in one
                  tap.
                </DescriptiveNote>
                <div style={{ marginTop: 'var(--space-3)' }}>
                  <Button variant="secondary" size="sm" icon="plus" onClick={() => placeEditor.show()}>
                    Add a place
                  </Button>
                </div>
              </Card>
            )}

            <DescriptiveNote>
              {precise
                ? 'Precise location fields are on. Coordinates you enter stay private and are never included in a shared profile.'
                : 'Precise location is off, so only the place name is recorded. Turn it on in Settings → Privacy if you want coordinates.'}
            </DescriptiveNote>
          </div>
        }
      />

      <Dialog
        open={manage.open}
        onClose={manage.hide}
        title="Saved places"
        description="Quick-start buttons for the places you visit often."
      >
        <div className="list" style={{ marginBottom: 'var(--space-4)' }}>
          {saved.items.length === 0 ? (
            <p className="small faint">No saved places yet.</p>
          ) : (
            saved.items.map((place) => (
              <div key={place.id} className="list-row">
                <span className="list-row__body">
                  <span className="list-row__title">
                    {place['icon'] ? `${String(place['icon'])} ` : ''}
                    {String(place['name'])}
                  </span>
                </span>
                <span className="list-row__trailing">
                  <IconButton
                    icon="edit"
                    label={`Edit ${String(place['name'])}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => placeEditor.show(place)}
                  />
                  <IconButton
                    icon="trash"
                    label={`Delete ${String(place['name'])}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => placeConfirm.show(place)}
                  />
                </span>
              </div>
            ))
          )}
        </div>
        <Button variant="secondary" icon="plus" onClick={() => placeEditor.show()}>
          Add a place
        </Button>
      </Dialog>

      <Dialog
        open={placeEditor.open}
        onClose={placeEditor.hide}
        title={placeEditor.value ? 'Edit saved place' : 'Add a saved place'}
      >
        <RecordForm
          collection="savedLocations"
          record={placeEditor.value}
          onSubmit={async (values) => {
            if (placeEditor.value) {
              await saved.update(placeEditor.value.id, values);
              toast.success('Saved');
            } else {
              await saved.create({ sortOrder: saved.items.length, ...values });
              toast.success('Place added');
            }
            placeEditor.hide();
          }}
          onCancel={placeEditor.hide}
        />
      </Dialog>

      <ConfirmDialog
        open={placeConfirm.open}
        onClose={placeConfirm.hide}
        title="Delete this saved place?"
        body="Past sessions started from it are kept — only the quick-start button goes away."
        onConfirm={async () => {
          if (!placeConfirm.value) return;
          await saved.remove(placeConfirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}
