import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFronting } from '../core/fronting.js';
import { useCollection } from '../core/data.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip } from '../ui/primitives.js';
import { DateTimeField, SearchField, TextField, useDebounced } from '../ui/forms.js';
import { EmptyState, SkeletonList } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * Quick Front.
 *
 * One screen, one save. Pick who is out — one person, several, or nobody named —
 * and everything else is optional. It is reachable from the dashboard, the app
 * shortcuts, a notification and a direct link, because the moment worth
 * recording rarely waits for three taps of navigation.
 */
export default function QuickFront(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t, term } = useI18n();
  const toast = useToast();
  const { state, loading, start, switchTo, addCoFronter } = useFronting();
  const members = useCollection('members', {
    filter: (member) => member['archived'] !== true,
  });

  const forceSwitch = params.has('switch');
  const hasActive = state.active.length > 0;
  const isSwitch = forceSwitch || hasActive;

  const alreadyFrontingIds = useMemo(
    () =>
      new Set(
        state.active.flatMap((event) => [
          ...(event.memberId ? [event.memberId] : []),
          ...event.coFronters.map((co) => co.id),
        ]),
      ),
    [state.active],
  );

  const [selected, setSelected] = useState<string[]>(() => {
    const preset = params.get('member');
    return preset ? [preset] : [];
  });
  const [unknown, setUnknown] = useState(false);
  const [search, setSearch] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(new Date().toISOString());
  const [activity, setActivity] = useState('');
  const [mood, setMood] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const query = useDebounced(search);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const list = term
      ? members.items.filter((member) => String(member['name']).toLowerCase().includes(term))
      : members.items;
    // Whoever fronts most often is easiest to reach first.
    return [...list].sort(
      (a, b) => Number(b['frontCount'] ?? 0) - Number(a['frontCount'] ?? 0),
    );
  }, [members.items, query]);

  const toggle = (id: string): void => {
    setUnknown(false);
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  };

  const save = async (): Promise<void> => {
    if (selected.length === 0 && !unknown) {
      toast.error(term('Choose who is {{fronting}}'), term('Or mark it as unknown if you are not sure.'));
      return;
    }

    setSaving(true);
    try {
      const [primary, ...coFronters] = selected;
      const payload = {
        memberId: unknown ? null : (primary ?? null),
        coFronterIds: coFronters,
        startedAt: startedAt ?? new Date().toISOString(),
        activity,
        mood,
        location,
        note,
        unknownFronter: unknown,
      };

      if (isSwitch) await switchTo(payload);
      else await start({ ...payload, endOthers: false });

      toast.success(t('front.logged'));
      navigate('/whos-there');
    } catch (cause) {
      toast.fromError(cause, term('Could not record the {{front}}'));
      setSaving(false);
    }
  };

  /** Joins the open front rather than replacing it — nobody already out is ended. */
  const addToFront = async (): Promise<void> => {
    const primaryEvent = state.active[0];
    const joining = selected.filter((id) => !alreadyFrontingIds.has(id));
    if (!primaryEvent || joining.length === 0) {
      toast.error(term('Choose someone new'), term('Everyone selected is already {{fronting}}.'));
      return;
    }

    setSaving(true);
    try {
      for (const memberId of joining) {
        await addCoFronter(primaryEvent.id, memberId);
      }
      toast.success(term('Added to the {{front}}'));
      navigate('/whos-there');
    } catch (cause) {
      toast.fromError(cause, term('Could not add them'));
      setSaving(false);
    }
  };

  if (loading || members.loading) {
    return (
      <>
        <PageHeader title={t('front.quickFront')} />
        <SkeletonList rows={4} />
      </>
    );
  }

  if (members.items.length === 0) {
    return (
      <>
        <PageHeader title={t('front.quickFront')} />
        <Card>
          <EmptyState
            icon="member"
            title={t('members.empty')}
            body={term(
              'You can still record that someone was {{fronting}} without naming them — or add {{members}} first.',
            )}
            action={{ label: t('members.create'), run: () => navigate('/members?new=1') }}
            secondaryAction={{
              label: t('front.unknown'),
              run: () => {
                setUnknown(true);
                void save();
              },
            }}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('front.quickFront')}
        description={
          hasActive && !forceSwitch
            ? term('Ringed avatars are already {{fronting}}. Add more without ending them, or switch to replace the {{front}} entirely.')
            : isSwitch
              ? term('This ends the {{front}} that is open and starts a new one.')
              : term('Choose one {{member}} or several. Everything else is optional.')
        }
      />

      {members.items.length > 8 ? (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <SearchField value={search} onChange={setSearch} placeholder={term('Find a {{member}}…')} />
        </div>
      ) : null}

      <Card flush style={{ marginBottom: 'var(--space-4)' }}>
        <div
          className="grid"
          style={{ ['--grid-min' as never]: '118px', padding: 'var(--space-3)' }}
        >
          {visible.map((member) => {
            const index = selected.indexOf(member.id);
            const isSelected = index >= 0;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => toggle(member.id)}
                aria-pressed={isSelected}
                className="card card--interactive"
                style={{
                  padding: 'var(--space-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  textAlign: 'center',
                  borderColor: isSelected ? 'var(--accent)' : undefined,
                  background: isSelected ? 'var(--accent-soft)' : undefined,
                  position: 'relative',
                }}
              >
                <Avatar
                  name={String(member['name'])}
                  src={(member['avatarUrl'] as string) ?? null}
                  color={(member['color'] as string) ?? null}
                  icon={(member['icon'] as string) ?? null}
                  size={48}
                  round
                  ring={isSelected || alreadyFrontingIds.has(member.id)}
                />
                <span className="small truncate" style={{ maxWidth: '100%' }}>
                  {String(member['name'])}
                </span>
                {isSelected ? (
                  <span
                    className="chip chip--accent"
                    style={{ position: 'absolute', top: 6, right: 6 }}
                    aria-label={index === 0 ? term('At the {{front}}') : term('Co-{{fronting}}')}
                  >
                    {index === 0 ? term('{{Front}}') : `+${index}`}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </Card>

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <Chip
          selected={unknown}
          onClick={() => {
            setUnknown((value) => !value);
            setSelected([]);
          }}
        >
          <Icon name="help" size={12} /> {t('front.unknown')}
        </Chip>
        {selected.length > 1 ? (
          <span className="tiny faint">
            {term('{{Fronting}} together — the first one chosen is at the {{front}}.')}
          </span>
        ) : null}
      </div>

      <Card>
        <button
          type="button"
          className="row row--between disclosure-toggle"
          onClick={() => setShowDetail((value) => !value)}
          aria-expanded={showDetail}
        >
          <span className="card__title">Add detail</span>
          <Icon name={showDetail ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>

        {showDetail ? (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <DateTimeField label="Started" value={startedAt} onChange={setStartedAt} />
            <TextField label="Activity" value={activity} onChange={setActivity} placeholder="work, errands, resting…" />
            <TextField label="Mood" value={mood} onChange={setMood} />
            <TextField label="Location" value={location} onChange={setLocation} />
            <TextField label="Note" value={note} onChange={setNote} multiline rows={3} />
          </div>
        ) : null}
      </Card>

      <div className="row" style={{ marginTop: 'var(--space-5)' }}>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {t('action.cancel')}
        </Button>
        <span className="spacer" />
        {hasActive && !forceSwitch ? (
          <>
            <Button
              variant="secondary"
              size="lg"
              loading={saving}
              onClick={() => void addToFront()}
              disabled={selected.every((id) => alreadyFrontingIds.has(id))}
            >
              {term('Add to {{front}}')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon="bolt"
              loading={saving}
              onClick={() => void save()}
              disabled={selected.length === 0 && !unknown}
            >
              {term('Switch instead')}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="lg"
            icon="bolt"
            loading={saving}
            onClick={() => void save()}
            disabled={selected.length === 0 && !unknown}
          >
            {isSwitch ? t('front.switch') : t('front.start')}
          </Button>
        )}
      </div>
    </>
  );
}
