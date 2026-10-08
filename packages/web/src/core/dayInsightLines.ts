import { formatDuration } from '@pluralnova/shared';

/**
 * Turns one day's baseline comparisons into plain sentences. Shared by the
 * Daily Summary (which already showed these) and Insights' Story tab (which
 * adds a couple more lines of its own alongside them) — one wording, used in
 * both places, rather than two copies drifting apart.
 */
export interface DayInsights {
  mood: { today: number; baseline: number } | null;
  emotions: { todayCount: number; baselineCountPerDay: number; todayAverage: number; baselineAverage: number } | null;
  sensations: { todayCount: number; baselineCountPerDay: number } | null;
  fronting: { todayMinutes: number; baselineMinutesPerDay: number } | null;
  sleep: { todayMinutes: number; baselineMinutes: number } | null;
  journalStreak: number;
}

/**
 * Each line is a comparison against the trailing two weeks — never a claim
 * about why the numbers differ. Only `fronting` and `journal` are configurable
 * terms; the rest (mood, emotion, sensation, sleep) are not, so those lines
 * never need `term()`.
 */
export function insightLines(insights: DayInsights, term: (text: string) => string): string[] {
  const lines: string[] = [];
  if (insights.mood) {
    lines.push(
      `Mood averaged ${insights.mood.today}/10 today, compared to ${insights.mood.baseline}/10 over the last two weeks.`,
    );
  }
  if (insights.emotions) {
    const { todayCount, baselineCountPerDay, todayAverage, baselineAverage } = insights.emotions;
    lines.push(
      `${todayCount} emotion${todayCount === 1 ? '' : 's'} logged today, averaging ${todayAverage}/10 — ` +
        `compared to about ${baselineCountPerDay} a day recently, averaging ${baselineAverage}/10.`,
    );
  }
  if (insights.sensations) {
    const { todayCount, baselineCountPerDay } = insights.sensations;
    lines.push(
      `${todayCount} body sensation${todayCount === 1 ? '' : 's'} noted today, compared to about ${baselineCountPerDay} a day recently.`,
    );
  }
  if (insights.fronting) {
    lines.push(
      term(
        `{{Fronting}} totalled ${formatDuration(insights.fronting.todayMinutes)} today, compared to a usual ${formatDuration(insights.fronting.baselineMinutesPerDay)} a day.`,
      ),
    );
  }
  if (insights.sleep) {
    lines.push(
      `Slept ${formatDuration(insights.sleep.todayMinutes)} last night, compared to an average of ${formatDuration(insights.sleep.baselineMinutes)}.`,
    );
  }
  if (insights.journalStreak > 1) {
    lines.push(term(`{{Journal}} entries ${insights.journalStreak} days in a row, including today.`));
  }
  return lines;
}
