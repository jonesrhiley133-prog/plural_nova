import { useEffect, useMemo, useState } from 'react';
import { BODY_REGIONS, EMOTIONS, EMOTION_FAMILIES, SENSATION_WORDS, type Emotion } from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useFronting } from '../core/fronting.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { Avatar, Button, Chip } from '../ui/primitives.js';
import { TagField } from '../ui/forms.js';
import { Dialog } from '../ui/overlays.js';
import { EmotionOption } from '../modules/Emotions.js';

/**
 * The check-in.
 *
 * Three short screens, full screen, one after another: who is out, how it
 * feels, and where that shows up in the body. Each step is skippable on its
 * own — the flow finishes either way, and finishing it is the check-in.
 * Fronting is only ever touched here if the selection actually changes;
 * leaving it exactly as it was is "continuing with the same member," not a
 * no-op that happens to look like one.
 */

type Step = 'front' | 'emotion' | 'sensation';
const STEPS: readonly Step[] = ['front', 'emotion', 'sensation'];

const TITLES: Record<Step, string> = {
  front: "Who's there?",
  emotion: 'How are you feeling?',
  sensation: 'Anything in the body?',
};

export function CheckIn({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { t, term } = useI18n();
  const toast = useToast();
  const members = useCollection('members');
  const { state, start, switchTo } = useFronting();
  const emotionEntries = useCollection('emotionEntries');
  const sensations = useCollection('bodySensations');

  const [step, setStep] = useState<Step>('front');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [family, setFamily] = useState<string | null>(null);
  const [emotions, setEmotions] = useState<Emotion[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [words, setWords] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const currentFrontingIds = useMemo(
    () =>
      state.active.flatMap((event) => [
        ...(event.member ? [event.member.id] : []),
        ...event.coFronters.map((co) => co.id),
      ]),
    [state.active],
  );

  // Captured once per open rather than kept in sync — a check-in already in
  // progress should not be rearranged by fronting changing somewhere else.
  useEffect(() => {
    if (!open) return;
    setStep('front');
    setSelectedMembers(currentFrontingIds);
    setFamily(null);
    setEmotions([]);
    setRegions([]);
    setWords([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const primaryId = selectedMembers[0] ?? null;
  const stepIndex = STEPS.indexOf(step);
  const familyOptions = family ? EMOTIONS.filter((emotion) => emotion.family === family) : [];

  const toggleMember = (id: string): void => {
    setSelectedMembers((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const toggleEmotion = (emotion: Emotion): void => {
    setEmotions((current) =>
      current.some((item) => item.id === emotion.id)
        ? current.filter((item) => item.id !== emotion.id)
        : [...current, emotion],
    );
  };

  const toggleRegion = (id: string): void => {
    setRegions((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const advance = (): void => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
    else finish();
  };

  const finish = (): void => {
    toast.success('Checked in');
    onClose();
  };

  const confirmFront = async (): Promise<void> => {
    const changed =
      selectedMembers.length !== currentFrontingIds.length ||
      selectedMembers.some((id) => !currentFrontingIds.includes(id));
    if (changed && selectedMembers.length > 0) {
      const [memberId, ...coFronterIds] = selectedMembers;
      setSaving(true);
      try {
        if (currentFrontingIds.length > 0) await switchTo({ memberId, coFronterIds, endOthers: true });
        else await start({ memberId, coFronterIds });
      } catch (cause) {
        toast.fromError(cause, term('Could not record who is {{fronting}}'));
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    advance();
  };

  const saveEmotions = async (): Promise<void> => {
    if (emotions.length === 0) {
      advance();
      return;
    }
    setSaving(true);
    try {
      const recordedAt = new Date().toISOString();
      for (const emotion of emotions) {
        await emotionEntries.create({
          emotionId: emotion.id,
          category: emotion.family,
          intensity: 3,
          recordedAt,
          memberId: primaryId,
        });
      }
      advance();
    } catch (cause) {
      toast.fromError(cause, 'Could not save that');
    } finally {
      setSaving(false);
    }
  };

  const saveSensations = async (): Promise<void> => {
    if (regions.length === 0 || words.length === 0) {
      finish();
      return;
    }
    setSaving(true);
    try {
      const recordedAt = new Date().toISOString();
      for (const region of regions) {
        for (const word of words) {
          await sensations.create({ region, sensation: word, intensity: 3, recordedAt, memberId: primaryId });
        }
      }
      finish();
    } catch (cause) {
      toast.fromError(cause, 'Could not save that');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullscreen
      title={TITLES[step]}
      description={term(`Step ${stepIndex + 1} of ${STEPS.length}`)}
      footer={
        <>
          <Button variant="ghost" onClick={() => (step === 'sensation' ? finish() : advance())}>
            {t('action.skip')}
          </Button>
          <span className="spacer" />
          <Button
            variant="primary"
            loading={saving}
            onClick={() => {
              if (step === 'front') void confirmFront();
              else if (step === 'emotion') void saveEmotions();
              else void saveSensations();
            }}
          >
            {step === 'sensation' ? 'Finish check-in' : t('action.next')}
          </Button>
        </>
      }
    >
      {step === 'front' ? (
        <div className="stack">
          <p className="muted">
            {term('Tap whoever is out. Leaving the selection as it is continues with who is already {{fronting}}.')}
          </p>
          <div className="grid" style={{ ['--grid-min' as never]: '96px' }}>
            {members.items.map((member) => {
              const selected = selectedMembers.includes(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  className="card card--interactive"
                  aria-pressed={selected}
                  onClick={() => toggleMember(member.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: 'var(--space-3)',
                    borderColor: selected ? 'var(--accent)' : undefined,
                    background: selected ? 'var(--accent-soft)' : undefined,
                  }}
                >
                  <Avatar
                    name={String(member['name'])}
                    src={(member['avatarUrl'] as string) ?? null}
                    color={(member['color'] as string) ?? null}
                    icon={(member['icon'] as string) ?? null}
                    size={52}
                    round
                    ring={selected}
                  />
                  <span className="small truncate" style={{ maxWidth: '100%' }}>
                    {String(member['name'])}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === 'emotion' ? (
        <div className="stack">
          <p className="muted">Pick as many as fit, or skip this one entirely.</p>

          {emotions.length > 0 ? (
            <div className="row">
              {emotions.map((emotion) => (
                <Chip key={emotion.id} color={emotion.color} accent>
                  {emotion.emoji} {emotion.name}
                </Chip>
              ))}
            </div>
          ) : null}

          <div className="row">
            {EMOTION_FAMILIES.map((group) => (
              <Chip
                key={group.id}
                selected={family === group.id}
                color={group.color}
                onClick={() => setFamily(family === group.id ? null : group.id)}
              >
                {group.label}
              </Chip>
            ))}
          </div>

          {family ? (
            <div className="row">
              {familyOptions.map((emotion) => (
                <EmotionOption
                  key={emotion.id}
                  emotion={emotion}
                  selected={emotions.some((item) => item.id === emotion.id)}
                  onClick={() => toggleEmotion(emotion)}
                />
              ))}
            </div>
          ) : (
            <p className="small faint">Choose a family above to see its emotions.</p>
          )}
        </div>
      ) : null}

      {step === 'sensation' ? (
        <div className="stack">
          <p className="muted">Where, if anywhere?</p>
          <div className="row">
            {BODY_REGIONS.map((region) => (
              <Chip key={region.id} selected={regions.includes(region.id)} onClick={() => toggleRegion(region.id)}>
                {region.label}
              </Chip>
            ))}
          </div>

          {regions.length > 0 ? (
            <TagField
              label="What does it feel like?"
              values={words}
              onChange={setWords}
              suggestions={[...SENSATION_WORDS]}
            />
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
