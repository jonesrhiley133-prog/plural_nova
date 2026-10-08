/**
 * Mood vocabulary for the unified check-in's 0–100 slider.
 *
 * Separate from `Wellbeing.tsx`'s own `MOOD_WORDS` (a quick-pick chip set
 * mapped onto the legacy 1–10 `moodEntries.score`, non-monotonic by design —
 * Tired and Anxious both sit around the same low score for different
 * reasons). This is a monotonic ladder, meant for a slider's end-to-end
 * labels and for bucketing check-ins by how they felt, which only works if
 * the bands never overlap. Both vocabularies stay, each serving the screen
 * it was built for.
 */

export interface MoodBand {
  readonly min: number;
  readonly max: number;
  readonly label: string;
}

export const MOOD_LABELS: readonly MoodBand[] = [
  { min: 0, max: 9, label: 'Terrible' },
  { min: 10, max: 24, label: 'Rough' },
  { min: 25, max: 39, label: 'Low' },
  { min: 40, max: 54, label: 'Okay' },
  { min: 55, max: 69, label: 'Good' },
  { min: 70, max: 84, label: 'Great' },
  { min: 85, max: 100, label: 'Amazing' },
];

export function moodLabelFor(mood: number): string {
  const clamped = Math.min(Math.max(Math.round(mood), 0), 100);
  return MOOD_LABELS.find((band) => clamped >= band.min && clamped <= band.max)?.label ?? 'Okay';
}

/** `feelingEntries.mood` (0–100) converted to `moodEntries.score`'s 1–10 range, for the dual-write. */
export function moodScoreToLegacy10(mood: number): number {
  const clamped = Math.min(Math.max(Math.round(mood), 0), 100);
  return Math.min(Math.max(Math.round(clamped / 10), 1), 10);
}

/** The inverse — a legacy `moodEntries.score` (1–10) upscaled to the 0–100 range, for reading old rows alongside new ones (the Snapshot's fallback, before any `feelingEntries` exist). */
export function legacy10ToMoodScore(score: number): number {
  return Math.min(Math.max(Math.round(score), 1), 10) * 10;
}
