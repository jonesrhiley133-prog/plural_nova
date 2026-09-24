import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  EMOTIONS,
  EMOTION_FAMILIES,
  getEmotion,
  getEmotionFamily,
  intensityLabel,
  searchEmotions,
  type Emotion,
} from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useSystemMode, useActiveMemberId } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, Meter } from '../ui/primitives.js';
import { SearchField, TextField, useDebounced } from '../ui/forms.js';
import { AsyncContent, DescriptiveNote } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Logging an emotion.
 *
 * A three-step sheet — which emotion, how strong, anything else — held in one
 * piece of state. Going back a step never clears what was already chosen, which
 * is the specific failure this flow is built to avoid: losing the selection on
 * the way to "next" makes the whole feature not worth opening.
 */
export default function Emotions(): JSX.Element {
  const [params] = useSearchParams();
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const systemMode = useSystemMode();
  const activeMemberId = useActiveMemberId();
  const members = useRecordMap('members');

  const entries = useCollection('emotionEntries');
  const sheet = useDialog();
  const [autoOpened, setAutoOpened] = useState(false);

  if (params.get('new') === '1' && !autoOpened) {
    setAutoOpened(true);
    sheet.show();
  }

  const recentIds = useMemo(
    () => [...new Set(entries.items.slice(0, 40).map((entry) => String(entry['emotionId'])))].slice(0, 8),
    [entries.items],
  );

  return (
    <>
      <PageHeader
        title={t('emotions.title')}
        description={`${EMOTIONS.length} to choose from, in ${EMOTION_FAMILIES.length} families.`}
        actions={
          <Button variant="primary" icon="plus" onClick={() => sheet.show()}>
            Log an emotion
          </Button>
        }
      />

      {recentIds.length > 0 ? (
        <Card title="Log again" subtitle="What you have recorded most recently" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="row">
            {recentIds.map((id) => {
              const emotion = getEmotion(id);
              if (!emotion) return null;
              return (
                <Chip
                  key={id}
                  color={emotion.color}
                  onClick={() => {
                    void entries
                      .create({
                        emotionId: emotion.id,
                        category: emotion.family,
                        intensity: 3,
                        recordedAt: new Date().toISOString(),
                        memberId: activeMemberId,
                      })
                      .then(() => toast.success(`${emotion.name} recorded`))
                      .catch((cause: unknown) => toast.fromError(cause));
                  }}
                >
                  {emotion.emoji} {emotion.name}
                </Chip>
              );
            })}
          </div>
        </Card>
      ) : null}

      <AsyncContent
        loading={entries.loading}
        error={entries.error}
        items={entries.items}
        onRetry={entries.reload}
        empty={{
          title: 'Nothing logged yet',
          body: 'Naming a feeling is the whole exercise — the chart comes later.',
          icon: 'emotion',
          action: { label: 'Log an emotion', run: () => sheet.show() },
        }}
      >
        {(records) => (
          <Card flush>
            <div className="list">
              {records.slice(0, 60).map((entry) => {
                const emotion = getEmotion(String(entry['emotionId']));
                const family = getEmotionFamily(String(entry['category']));
                const member = entry['memberId'] ? members.get(String(entry['memberId'])) : null;
                const intensity = Number(entry['intensity'] ?? 3);

                return (
                  <div key={entry.id} className="list-row">
                    <span
                      className="avatar"
                      style={{
                        ['--avatar-size' as never]: '34px',
                        fontSize: 16,
                        borderColor: family?.color ?? 'var(--border)',
                      }}
                      aria-hidden="true"
                    >
                      {emotion?.emoji ?? '◍'}
                    </span>
                    <span className="list-row__body">
                      <span className="list-row__title">
                        {emotion?.name ?? String(entry['emotionId'])}
                        <span className="faint"> · {intensityLabel(intensity)}</span>
                      </span>
                      <span className="list-row__meta">
                        <span>{dates.relative(String(entry['recordedAt']))}</span>
                        {family ? <Chip color={family.color}>{family.label}</Chip> : null}
                        {member ? (
                          <Chip color={(member['color'] as string) ?? null}>{String(member['name'])}</Chip>
                        ) : null}
                        {entry['context'] ? <span className="faint">{String(entry['context'])}</span> : null}
                      </span>
                    </span>
                    <span className="list-row__trailing" style={{ width: 54 }}>
                      <Meter
                        value={intensity}
                        max={5}
                        color={family?.color}
                        label={`Intensity ${intensity} of 5`}
                      />
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </AsyncContent>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          {term(
            'This is a log of words you chose. PluralNova does not interpret it, score it, or decide what it says about you or your {{system}}.',
          )}
        </DescriptiveNote>
      </div>

      <EmotionSheet
        open={sheet.open}
        onClose={sheet.hide}
        systemMode={systemMode}
        members={[...members.values()]}
        defaultMemberId={activeMemberId}
        recentIds={recentIds}
        onSave={async (values) => {
          await entries.create(values);
        }}
        onSaved={(count) => toast.success(count > 1 ? `${count} emotions recorded` : t('emotions.saved'))}
      />
    </>
  );
}

interface Draft {
  emotions: Emotion[];
  intensity: number;
  context: string;
  activity: string;
  note: string;
  memberId: string | null;
}

const EMPTY_DRAFT: Draft = {
  emotions: [],
  intensity: 3,
  context: '',
  activity: '',
  note: '',
  memberId: null,
};

function EmotionSheet({
  open,
  onClose,
  systemMode,
  members,
  defaultMemberId,
  recentIds,
  onSave,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  systemMode: boolean;
  members: { id: string; [key: string]: unknown }[];
  defaultMemberId: string | null;
  recentIds: string[];
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onSaved: (count: number) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT, memberId: defaultMemberId });
  const [family, setFamily] = useState<string | null>(null);
  const [rawSearch, setRawSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const search = useDebounced(rawSearch);

  // The draft is one object that only the save path clears. Moving between
  // steps changes `step` and nothing else, so nothing entered is ever lost.
  const reset = (): void => {
    setDraft({ ...EMPTY_DRAFT, memberId: defaultMemberId });
    setFamily(null);
    setRawSearch('');
    setStep(0);
  };

  const recent = useMemo(
    () => recentIds.map((id) => getEmotion(id)).filter((emotion): emotion is Emotion => emotion != null),
    [recentIds],
  );

  const options = useMemo(() => {
    if (search.trim()) return searchEmotions(search).slice(0, 60);
    if (family) return EMOTIONS.filter((emotion) => emotion.family === family);
    return [];
  }, [search, family]);

  const toggleEmotion = (emotion: Emotion): void => {
    setDraft((current) => {
      const already = current.emotions.some((item) => item.id === emotion.id);
      return {
        ...current,
        emotions: already
          ? current.emotions.filter((item) => item.id !== emotion.id)
          : [...current.emotions, emotion],
      };
    });
  };

  const surpriseMe = (): void => {
    const pool = options.length > 0 ? options : EMOTIONS;
    const unpicked = pool.filter((emotion) => !draft.emotions.some((item) => item.id === emotion.id));
    const from = unpicked.length > 0 ? unpicked : pool;
    const pick = from[Math.floor(Math.random() * from.length)];
    if (pick) toggleEmotion(pick);
  };

  const skip = (): void => {
    reset();
    onClose();
  };

  const save = async (): Promise<void> => {
    if (draft.emotions.length === 0) return;
    setSaving(true);
    try {
      const recordedAt = new Date().toISOString();
      for (const emotion of draft.emotions) {
        await onSave({
          emotionId: emotion.id,
          category: emotion.family,
          intensity: draft.intensity,
          recordedAt,
          context: draft.context,
          activity: draft.activity,
          note: draft.note,
          memberId: draft.memberId,
        });
      }
      onSaved(draft.emotions.length);
      reset();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        // Cleared on close, not on step changes.
        reset();
      }}
      title={step === 0 ? t('emotions.choose') : step === 1 ? t('emotions.intensity') : t('emotions.context')}
      footer={
        <>
          {step === 0 ? (
            <Button variant="ghost" onClick={skip}>
              {t('action.skip')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>
              {t('action.back')}
            </Button>
          )}
          <span className="spacer" />
          {step < 2 ? (
            <Button
              variant="primary"
              onClick={() => setStep((value) => value + 1)}
              disabled={draft.emotions.length === 0}
            >
              {t('action.next')}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void save()} loading={saving}>
              {t('action.save')}
            </Button>
          )}
        </>
      }
    >
      {draft.emotions.length > 0 ? (
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          {draft.emotions.map((emotion) => (
            <Chip key={emotion.id} color={emotion.color} accent>
              {emotion.emoji} {emotion.name}
            </Chip>
          ))}
          {step > 0 ? <Chip>{intensityLabel(draft.intensity)}</Chip> : null}
        </div>
      ) : null}

      {step === 0 ? (
        <div className="stack">
          <div className="row" style={{ alignItems: 'center' }}>
            <SearchField value={rawSearch} onChange={setRawSearch} placeholder="Search 144 emotions…" />
            <Button variant="secondary" size="sm" icon="shuffle" onClick={surpriseMe}>
              Surprise me
            </Button>
          </div>

          {recent.length > 0 && !search.trim() && !family ? (
            <div className="field">
              <span className="field__label">Recently used</span>
              <div className="row">
                {recent.map((emotion) => (
                  <Chip
                    key={emotion.id}
                    selected={draft.emotions.some((item) => item.id === emotion.id)}
                    color={emotion.color}
                    onClick={() => toggleEmotion(emotion)}
                  >
                    {emotion.emoji} {emotion.name}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          {!search.trim() ? (
            <div className="row">
              {EMOTION_FAMILIES.map((group) => (
                <Chip
                  key={group.id}
                  selected={family === group.id}
                  onClick={() => setFamily(family === group.id ? null : group.id)}
                  color={group.color}
                >
                  {group.label}
                </Chip>
              ))}
            </div>
          ) : null}

          {family && !search.trim() ? (
            <p className="tiny faint">{getEmotionFamily(family)?.description}</p>
          ) : null}

          {options.length === 0 ? (
            <p className="small faint">
              {search.trim() ? 'Nothing matches that word.' : 'Pick a family, or search for a word.'}
            </p>
          ) : (
            <div className="row">
              {options.map((emotion) => (
                <Chip
                  key={emotion.id}
                  selected={draft.emotions.some((item) => item.id === emotion.id)}
                  color={emotion.color}
                  onClick={() => toggleEmotion(emotion)}
                >
                  {emotion.emoji} {emotion.name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="stack">
          {[1, 2, 3, 4, 5].map((level) => (
            <button
              key={level}
              type="button"
              className="card card--interactive"
              aria-pressed={draft.intensity === level}
              style={{
                textAlign: 'left',
                borderColor: draft.intensity === level ? 'var(--accent)' : undefined,
              }}
              onClick={() => setDraft((current) => ({ ...current, intensity: level }))}
            >
              <div className="row row--between">
                <span>{intensityLabel(level)}</span>
                <span className="row row--nowrap" style={{ gap: 3 }} aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((dot) => (
                    <span
                      key={dot}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: dot <= level ? draft.emotions[0]?.color ?? 'var(--accent)' : 'var(--surface-sunken)',
                      }}
                    />
                  ))}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="stack">
          <TextField
            label={t('emotions.context')}
            value={draft.context}
            onChange={(value) => setDraft((current) => ({ ...current, context: value }))}
            placeholder="at work, after a call, out of nowhere…"
          />
          <TextField
            label="Activity"
            value={draft.activity}
            onChange={(value) => setDraft((current) => ({ ...current, activity: value }))}
          />
          <TextField
            label="Note"
            value={draft.note}
            onChange={(value) => setDraft((current) => ({ ...current, note: value }))}
            multiline
            rows={3}
          />

          {systemMode && members.length > 0 ? (
            <div className="field">
              <span className="field__label">{t('emotions.who')}</span>
              <div className="row">
                <Chip
                  selected={draft.memberId === null}
                  onClick={() => setDraft((current) => ({ ...current, memberId: null }))}
                >
                  Unattributed
                </Chip>
                {members.map((member) => (
                  <Chip
                    key={member.id}
                    selected={draft.memberId === member.id}
                    color={(member['color'] as string) ?? null}
                    onClick={() => setDraft((current) => ({ ...current, memberId: member.id }))}
                  >
                    <Avatar
                      name={String(member['name'])}
                      color={(member['color'] as string) ?? null}
                      icon={(member['icon'] as string) ?? null}
                      size={16}
                      round
                    />
                    {String(member['name'])}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}

          <p className="tiny faint">
            <Icon name="info" size={11} /> Everything on this step is optional.
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}
