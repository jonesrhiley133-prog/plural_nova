import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  average,
  EMOTION_FAMILIES,
  emotionIdsOf,
  getEmotionFamily,
  intensityLabel,
  moodLabelFor,
  moodScoreToLegacy10,
  type Emotion,
  type StoredRecord,
} from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useAllEmotions, useFavoriteEmotions, filterEmotions } from '../core/emotions.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId, useSystemMode } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, Meter } from '../ui/primitives.js';
import { Field, SearchField, TagField, TextField, useDebounced } from '../ui/forms.js';
import { AsyncContent, DescriptiveNote } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { EmotionFace, EmotionOption } from './Emotions.js';

/**
 * The unified check-in.
 *
 * Mood and emotions used to be two separate questions on two separate
 * screens. This is one flow — a mood, then whichever emotions and however
 * much context actually apply, each step skippable — that writes to its own
 * richer collection (`feelingEntries`) while also creating the equivalent
 * `moodEntries`/`emotionEntries` rows, so every existing reader of either
 * (achievements, Emotion insights, Daily summary, the Dashboard mood widget,
 * "How we're feeling") keeps working exactly as before. Those two
 * collections are not being replaced — a `feelingEntries` row just also
 * writes to them.
 */

const SOCIAL_CONTEXTS: { value: string; label: string }[] = [
  { value: 'alone', label: 'Alone' },
  { value: 'oneOnOne', label: 'One other person' },
  { value: 'smallGroup', label: 'A small group' },
  { value: 'crowd', label: 'A crowd' },
  { value: 'online', label: 'Online' },
];

export default function MoodEmotions(): JSX.Element {
  const [params] = useSearchParams();
  const { t } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const systemMode = useSystemMode();
  const activeMemberId = useActiveMemberId();
  const members = useRecordMap('members');

  const feelings = useCollection('feelingEntries');
  const moods = useCollection('moodEntries');
  const emotionEntriesCol = useCollection('emotionEntries');
  const { emotions: allEmotions, findEmotion } = useAllEmotions();
  const favorites = useFavoriteEmotions();

  const sheet = useDialog();
  const confirm = useDialog<StoredRecord>();
  const [autoOpened, setAutoOpened] = useState(false);

  if (params.get('new') === '1' && !autoOpened) {
    setAutoOpened(true);
    sheet.show();
  }

  const recentIds = useMemo(
    () => [...new Set(feelings.items.slice(0, 40).flatMap((entry) => emotionIdsOf(entry)))].slice(0, 8),
    [feelings.items],
  );

  const createCheckIn = async (draft: FeelingDraft): Promise<void> => {
    const recordedAt = new Date().toISOString();
    const primaryId = draft.memberIds[0] ?? null;
    const coFronterIds = draft.memberIds.slice(1);

    const legacyMood = await moods.create({
      label: moodLabelFor(draft.mood),
      score: moodScoreToLegacy10(draft.mood),
      note: draft.note,
      recordedAt,
      tags: draft.tags,
      memberId: primaryId,
    });

    let legacyEmotionId: string | null = null;
    if (draft.emotions.length > 0) {
      const intensities = draft.emotions.map((emotion) => draft.emotionIntensities[emotion.id] ?? 3);
      const legacyEmotion = await emotionEntriesCol.create({
        emotionId: draft.emotions[0]!.id,
        emotionIds: draft.emotions.map((emotion) => emotion.id),
        category: draft.emotions[0]!.family,
        categories: draft.emotions.map((emotion) => emotion.family),
        intensity: Math.round(average(intensities)) || 3,
        recordedAt,
        context: draft.activity,
        activity: draft.activity,
        note: draft.note,
        tags: draft.tags,
        memberId: primaryId,
      });
      legacyEmotionId = legacyEmotion.id;
    }

    await feelings.create({
      mood: draft.mood,
      emotionIds: draft.emotions.map((emotion) => emotion.id),
      emotionIntensities: draft.emotionIntensities,
      activity: draft.activity,
      socialContext: draft.socialContext,
      frontingMemberIds: coFronterIds,
      note: draft.note,
      tags: draft.tags,
      recordedAt,
      legacyMoodEntryId: legacyMood.id,
      legacyEmotionEntryId: legacyEmotionId,
      memberId: primaryId,
    });
  };

  const deleteCheckIn = async (entry: StoredRecord): Promise<void> => {
    try {
      const legacyMoodId = entry['legacyMoodEntryId'];
      const legacyEmotionId = entry['legacyEmotionEntryId'];
      if (typeof legacyMoodId === 'string') await moods.remove(legacyMoodId);
      if (typeof legacyEmotionId === 'string') await emotionEntriesCol.remove(legacyEmotionId);
      await feelings.remove(entry.id);
      toast.success('Check-in deleted');
    } catch (cause) {
      toast.fromError(cause, 'Could not delete that');
    }
  };

  return (
    <>
      <PageHeader
        title="Mood & Emotions"
        description="How you feel, and what's contributing to it, in one place."
        actions={
          <Button variant="primary" icon="plus" onClick={() => sheet.show()}>
            New check-in
          </Button>
        }
      />

      <AsyncContent
        loading={feelings.loading}
        error={feelings.error}
        items={feelings.items}
        onRetry={feelings.reload}
        empty={{
          title: 'Nothing logged yet',
          body: 'A mood, and anything that goes with it — the chart comes later.',
          icon: 'mood',
          action: { label: 'New check-in', run: () => sheet.show() },
        }}
      >
        {(records) => (
          <Card flush>
            <div className="list">
              {records.slice(0, 60).map((entry) => {
                const emotions = emotionIdsOf(entry)
                  .map((id) => findEmotion(id))
                  .filter((item): item is Emotion => item != null);
                const primary = emotions[0] ?? null;
                const family = primary ? getEmotionFamily(primary.family) : null;
                const member = entry['memberId'] ? members.get(String(entry['memberId'])) : null;
                const mood = Number(entry['mood'] ?? 50);

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
                      {primary?.emoji ?? '◍'}
                    </span>
                    <span className="list-row__body">
                      <span className="list-row__title">
                        {moodLabelFor(mood)}
                        {emotions.length > 0 ? (
                          <span className="faint"> · {emotions.map((item) => item.name).join(', ')}</span>
                        ) : null}
                      </span>
                      <span className="list-row__meta">
                        <span>{dates.relative(String(entry['recordedAt']))}</span>
                        {member ? (
                          <Chip color={(member['color'] as string) ?? null}>{String(member['name'])}</Chip>
                        ) : null}
                        {entry['activity'] ? <span className="faint">{String(entry['activity'])}</span> : null}
                      </span>
                    </span>
                    <span className="list-row__trailing" style={{ width: 54 }}>
                      <Meter value={mood} max={100} color={family?.color} label={`Mood ${mood} of 100`} />
                    </span>
                    <IconButton
                      icon="trash"
                      label="Delete check-in"
                      variant="ghost"
                      size="sm"
                      onClick={() => confirm.show(entry)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </AsyncContent>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <DescriptiveNote>
          This is a log of what you chose. PluralNova does not interpret it, score it, or decide what it says about
          you or your system.
        </DescriptiveNote>
      </div>

      <FeelingSheet
        open={sheet.open}
        onClose={sheet.hide}
        systemMode={systemMode}
        members={[...members.values()]}
        defaultMemberId={activeMemberId}
        recentIds={recentIds}
        allEmotions={allEmotions}
        favoriteIds={favorites.ids}
        onToggleFavorite={favorites.toggle}
        onSave={createCheckIn}
        onSaved={() => toast.success('Checked in')}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this check-in?"
        body="It disappears from Mood & Emotions, and from the mood and emotion logs it also created."
        recoverable={false}
        onConfirm={async () => {
          if (confirm.value) await deleteCheckIn(confirm.value);
        }}
      />
    </>
  );
}

interface FeelingDraft {
  mood: number;
  emotions: Emotion[];
  emotionIntensities: Record<string, number>;
  activity: string;
  socialContext: string | null;
  note: string;
  tags: string[];
  memberIds: string[];
}

const EMPTY_DRAFT: FeelingDraft = {
  mood: 50,
  emotions: [],
  emotionIntensities: {},
  activity: '',
  socialContext: null,
  note: '',
  tags: [],
  memberIds: [],
};

const ALL_FILTER = '__all__';
const STEP_TITLES = ['How do you feel?', 'What emotions go with that?', 'Anything else?'];

function FeelingSheet({
  open,
  onClose,
  systemMode,
  members,
  defaultMemberId,
  recentIds,
  allEmotions,
  favoriteIds,
  onToggleFavorite,
  onSave,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  systemMode: boolean;
  members: { id: string; [key: string]: unknown }[];
  defaultMemberId: string | null;
  recentIds: string[];
  allEmotions: Emotion[];
  favoriteIds: Set<string>;
  onToggleFavorite: (emotionId: string) => Promise<void>;
  onSave: (draft: FeelingDraft) => Promise<void>;
  onSaved: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const toast = useToast();
  const custom = useCollection('customEmotions');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<FeelingDraft>({
    ...EMPTY_DRAFT,
    memberIds: defaultMemberId ? [defaultMemberId] : [],
  });
  const [family, setFamily] = useState<string | null>(null);
  const [rawSearch, setRawSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customFamily, setCustomFamily] = useState<string | null>(null);
  const [customEmoji, setCustomEmoji] = useState('');
  const search = useDebounced(rawSearch);

  const byId = useMemo(() => new Map(allEmotions.map((emotion) => [emotion.id, emotion])), [allEmotions]);

  // One draft object that only the save path clears — moving between steps
  // changes `step` and nothing else, so nothing entered is ever lost.
  const reset = (): void => {
    setDraft({ ...EMPTY_DRAFT, memberIds: defaultMemberId ? [defaultMemberId] : [] });
    setFamily(null);
    setRawSearch('');
    setCreatingCustom(false);
    setCustomFamily(null);
    setCustomEmoji('');
    setStep(0);
  };

  const recent = useMemo(
    () => recentIds.map((id) => byId.get(id)).filter((emotion): emotion is Emotion => emotion != null),
    [recentIds, byId],
  );

  const favorites = useMemo(
    () => allEmotions.filter((emotion) => favoriteIds.has(emotion.id)),
    [allEmotions, favoriteIds],
  );

  const options = useMemo(() => {
    if (search.trim()) return filterEmotions(allEmotions, search).slice(0, 80);
    if (family === ALL_FILTER) return allEmotions;
    if (family) return allEmotions.filter((emotion) => emotion.family === family);
    return [];
  }, [search, family, allEmotions]);

  const toggleEmotion = (emotion: Emotion): void => {
    setDraft((current) => {
      const already = current.emotions.some((item) => item.id === emotion.id);
      if (already) {
        const { [emotion.id]: _removed, ...rest } = current.emotionIntensities;
        return { ...current, emotions: current.emotions.filter((item) => item.id !== emotion.id), emotionIntensities: rest };
      }
      return {
        ...current,
        emotions: [...current.emotions, emotion],
        emotionIntensities: { ...current.emotionIntensities, [emotion.id]: 3 },
      };
    });
  };

  const setIntensity = (emotionId: string, level: number): void => {
    setDraft((current) => ({ ...current, emotionIntensities: { ...current.emotionIntensities, [emotionId]: level } }));
  };

  const toggleMember = (id: string): void => {
    setDraft((current) => ({
      ...current,
      memberIds: current.memberIds.includes(id)
        ? current.memberIds.filter((value) => value !== id)
        : [...current.memberIds, id],
    }));
  };

  const createCustomEmotion = async (): Promise<void> => {
    const name = rawSearch.trim();
    if (!name || !customFamily) return;
    try {
      const created = await custom.create({
        name,
        family: customFamily,
        emoji: customEmoji.trim() || null,
        sortOrder: custom.items.length,
      });
      const emotion: Emotion = {
        id: `custom.${created.id}`,
        name,
        family: customFamily,
        color: getEmotionFamily(customFamily)?.color ?? '#8a93a8',
        emoji: customEmoji.trim() || '✨',
      };
      toggleEmotion(emotion);
      setCreatingCustom(false);
      setCustomFamily(null);
      setCustomEmoji('');
      setRawSearch('');
      toast.success(`${name} added to your emotions`);
    } catch (cause) {
      toast.fromError(cause, 'Could not add that emotion');
    }
  };

  const skip = (): void => {
    reset();
    onClose();
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSave(draft);
      onSaved();
      reset();
      onClose();
    } catch (cause) {
      toast.fromError(cause, 'Could not save that');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title={STEP_TITLES[step] ?? STEP_TITLES[0]!}
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
            <Button variant="primary" onClick={() => setStep((value) => value + 1)}>
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
      {step > 0 ? (
        <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
          <Chip accent>{moodLabelFor(draft.mood)}</Chip>
          {draft.emotions.map((emotion) => (
            <Chip key={emotion.id} color={emotion.color} accent>
              {emotion.emoji} {emotion.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {step === 0 ? (
        <div className="stack">
          <Field label="Mood" hint={`${draft.mood} of 100 — ${moodLabelFor(draft.mood)}`}>
            {({ id }) => (
              <input
                id={id}
                type="range"
                min={0}
                max={100}
                value={draft.mood}
                onChange={(event) => setDraft((current) => ({ ...current, mood: Number(event.target.value) }))}
              />
            )}
          </Field>
          <div className="row row--between tiny faint">
            <span>Terrible</span>
            <span>Amazing</span>
          </div>
        </div>
      ) : null}

      {step === 1 ? (
        <div className="stack">
          <div className="row" style={{ alignItems: 'center' }}>
            <SearchField
              value={rawSearch}
              onChange={(value) => {
                setRawSearch(value);
                setCreatingCustom(false);
              }}
              placeholder={`Search ${allEmotions.length} emotions…`}
            />
          </div>

          {favorites.length > 0 && !search.trim() && !family ? (
            <div className="field">
              <span className="field__label">Favourites</span>
              <div className="row">
                {favorites.map((emotion) => (
                  <EmotionOption
                    key={emotion.id}
                    emotion={emotion}
                    selected={draft.emotions.some((item) => item.id === emotion.id)}
                    onClick={() => toggleEmotion(emotion)}
                    favorited
                    onToggleFavorite={() => void onToggleFavorite(emotion.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {recent.length > 0 && !search.trim() && !family ? (
            <div className="field">
              <span className="field__label">Recently used</span>
              <div className="row">
                {recent.map((emotion) => (
                  <EmotionOption
                    key={emotion.id}
                    emotion={emotion}
                    selected={draft.emotions.some((item) => item.id === emotion.id)}
                    onClick={() => toggleEmotion(emotion)}
                    favorited={favoriteIds.has(emotion.id)}
                    onToggleFavorite={() => void onToggleFavorite(emotion.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {!search.trim() ? (
            <div className="row">
              <Chip selected={family === ALL_FILTER} onClick={() => setFamily(family === ALL_FILTER ? null : ALL_FILTER)}>
                All
              </Chip>
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

          {options.length === 0 ? (
            <div className="stack" style={{ gap: 'var(--space-2)' }}>
              <p className="small faint">
                {search.trim() ? `Nothing matches "${search.trim()}".` : 'Pick a family, or search for a word — or skip this step entirely.'}
              </p>
              {search.trim() && !creatingCustom ? (
                <Button variant="secondary" size="sm" icon="plus" onClick={() => setCreatingCustom(true)}>
                  Add "{search.trim()}" as a new emotion
                </Button>
              ) : null}
              {search.trim() && creatingCustom ? (
                <div className="stack" style={{ gap: 'var(--space-2)' }}>
                  <span className="field__label">Closest family for "{search.trim()}"</span>
                  <div className="row">
                    {EMOTION_FAMILIES.map((fam) => (
                      <Chip
                        key={fam.id}
                        selected={customFamily === fam.id}
                        color={fam.color}
                        onClick={() => setCustomFamily(fam.id)}
                      >
                        {fam.label}
                      </Chip>
                    ))}
                  </div>
                  <div className="row" style={{ alignItems: 'flex-end' }}>
                    <TextField label="Emoji (optional)" value={customEmoji} onChange={setCustomEmoji} placeholder="✨" />
                    <Button variant="primary" size="sm" disabled={!customFamily} onClick={() => void createCustomEmotion()}>
                      Add
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="row">
              {options.map((emotion) => (
                <EmotionOption
                  key={emotion.id}
                  emotion={emotion}
                  selected={draft.emotions.some((item) => item.id === emotion.id)}
                  onClick={() => toggleEmotion(emotion)}
                  favorited={favoriteIds.has(emotion.id)}
                  onToggleFavorite={() => void onToggleFavorite(emotion.id)}
                />
              ))}
            </div>
          )}

          {draft.emotions.length > 0 ? (
            <div className="stack" style={{ gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <span className="field__label">How strong was each one?</span>
              {draft.emotions.map((emotion) => (
                <div key={emotion.id} className="row row--between" style={{ alignItems: 'center' }}>
                  <div className="row row--nowrap" style={{ alignItems: 'center' }}>
                    <EmotionFace emotion={emotion} size={28} />
                    <span className="small">{emotion.name}</span>
                  </div>
                  <div className="row row--nowrap" style={{ gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <button
                        key={level}
                        type="button"
                        aria-label={`${emotion.name} at ${intensityLabel(level)}`}
                        aria-pressed={(draft.emotionIntensities[emotion.id] ?? 3) === level}
                        onClick={() => setIntensity(emotion.id, level)}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          border: 'none',
                          cursor: 'pointer',
                          background:
                            level <= (draft.emotionIntensities[emotion.id] ?? 3) ? emotion.color : 'var(--surface-sunken)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="stack">
          <TextField
            label="Activity"
            value={draft.activity}
            onChange={(value) => setDraft((current) => ({ ...current, activity: value }))}
            placeholder="what you were doing"
          />

          <div className="field">
            <span className="field__label">Who was around</span>
            <div className="row">
              {SOCIAL_CONTEXTS.map((option) => (
                <Chip
                  key={option.value}
                  selected={draft.socialContext === option.value}
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      socialContext: current.socialContext === option.value ? null : option.value,
                    }))
                  }
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </div>

          <TagField
            label="Tags"
            values={draft.tags}
            onChange={(values) => setDraft((current) => ({ ...current, tags: values }))}
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
              <span className="field__label">Fronting</span>
              <div className="row">
                {members.map((member) => (
                  <Chip
                    key={member.id}
                    selected={draft.memberIds.includes(member.id)}
                    color={(member['color'] as string) ?? null}
                    onClick={() => toggleMember(member.id)}
                  >
                    <Avatar
                      name={String(member['name'])}
                      src={(member['avatarUrl'] as string) || null}
                      color={(member['color'] as string) ?? null}
                      size={16}
                      round
                    />
                    {String(member['name'])}
                  </Chip>
                ))}
              </div>
              <p className="tiny faint" style={{ marginTop: 'var(--space-1)' }}>
                {draft.memberIds.length > 1
                  ? 'The first you picked is who this is attributed to; the rest are co-fronting.'
                  : 'Leave everyone unselected for a whole-system entry.'}
              </p>
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
