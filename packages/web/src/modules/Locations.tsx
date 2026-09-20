import { useAuth } from '../core/auth.js';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Card } from '../ui/primitives.js';
import { DescriptiveNote } from '../ui/feedback.js';

/**
 * Places, recorded by hand.
 *
 * Nothing is captured automatically. The coordinate fields exist for anyone who
 * wants them and are hidden entirely unless precise location has been turned on
 * in privacy settings.
 */
export default function Locations(): JSX.Element {
  const { settings } = useAuth();
  const precise = settings.privacy.allowPreciseLocation;

  return (
    <CollectionScreen
      collection="locationEntries"
      description="Somewhere you went, when, and who was out for it."
      emptyTitle="No places recorded"
      emptyBody="Useful alongside fronting — where someone was often explains a lot about a day."
      {...(precise ? {} : { formOmit: ['latitude', 'longitude', 'address'] })}
      newRecordDefaults={{ visitedAt: new Date().toISOString() }}
      above={
        <Card style={{ marginBottom: 'var(--space-4)' }}>
          <DescriptiveNote>
            {precise
              ? 'Precise location fields are on. Coordinates you enter stay private and are never included in a shared profile.'
              : 'Precise location is off, so only the place name is recorded. Turn it on in Settings → Privacy if you want coordinates.'}
          </DescriptiveNote>
        </Card>
      }
    />
  );
}
