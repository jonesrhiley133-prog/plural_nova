/**
 * Achievements are opt-in encouragement, never a scoreboard. Nothing here
 * measures how "well" a system is doing — each one marks that a part of the app
 * has been used at least once, or used steadily.
 */

export type AchievementMetric =
  | 'members.count'
  | 'frontEvents.count'
  | 'journalEntries.count'
  | 'notes.count'
  | 'tasks.completed'
  | 'tasks.streakDays'
  | 'calendarEvents.count'
  | 'emotionEntries.count'
  | 'sleepEntries.count'
  | 'subsystems.count'
  | 'relationships.count'
  | 'polls.count'
  | 'headspaceObjects.count'
  | 'stories.count'
  | 'trackingDays'
  | 'backups.count'
  | 'classes.count'
  | 'assignments.completed'
  | 'extracurriculars.count'
  | 'studySessions.count'
  | 'studySessions.hours'
  | 'schoolCheckIns.count'
  | 'boards.count'
  | 'bucketListItems.completed'
  | 'watchlistItems.watched'
  | 'memberNotes.count'
  | 'wellbeingGames.count'
  | 'wellbeingGames.streakDays'
  | 'cycleEntries.count'
  | 'symptomEntries.count';

export interface AchievementDef {
  key: string;
  label: string;
  description: string;
  icon: string;
  metric: AchievementMetric;
  threshold: number;
  category: 'firsts' | 'habits' | 'system' | 'creative' | 'care';
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { key: 'first-member', label: 'First light', description: 'Added someone to the {{system}}.', icon: '✦', metric: 'members.count', threshold: 1, category: 'firsts' },
  { key: 'five-members', label: 'Constellation', description: 'Five {{members}} recorded.', icon: '✧', metric: 'members.count', threshold: 5, category: 'system' },
  { key: 'twenty-members', label: 'Star cluster', description: 'Twenty {{members}} recorded.', icon: '❋', metric: 'members.count', threshold: 20, category: 'system' },
  { key: 'first-front', label: 'First orbit', description: 'Logged a {{front}} for the first time.', icon: '◐', metric: 'frontEvents.count', threshold: 1, category: 'firsts' },
  { key: 'fifty-fronts', label: 'Steady orbit', description: 'Fifty {{fronts}} logged.', icon: '◉', metric: 'frontEvents.count', threshold: 50, category: 'habits' },
  { key: 'first-journal', label: 'Opened the log', description: 'Wrote a first {{journal}} entry.', icon: '✎', metric: 'journalEntries.count', threshold: 1, category: 'firsts' },
  { key: 'ten-journal', label: 'Ten entries in', description: 'Ten {{journal}} entries written.', icon: '✒', metric: 'journalEntries.count', threshold: 10, category: 'habits' },
  { key: 'hundred-journal', label: 'Long record', description: 'A hundred {{journal}} entries.', icon: '📖', metric: 'journalEntries.count', threshold: 100, category: 'habits' },
  { key: 'first-note', label: 'Jotted down', description: 'Saved a first note.', icon: '▤', metric: 'notes.count', threshold: 1, category: 'firsts' },
  { key: 'first-subsystem', label: 'Inner structure', description: 'Created a first {{subsystem}}.', icon: '⊞', metric: 'subsystems.count', threshold: 1, category: 'system' },
  { key: 'first-relationship', label: 'Connected', description: 'Mapped a first relationship.', icon: '⟡', metric: 'relationships.count', threshold: 1, category: 'system' },
  { key: 'first-poll', label: 'Put to the {{system}}', description: 'Ran a first internal poll.', icon: '☰', metric: 'polls.count', threshold: 1, category: 'system' },
  { key: 'first-headspace', label: 'Mapped a room', description: 'Placed something in the {{headspace}}.', icon: '⬡', metric: 'headspaceObjects.count', threshold: 1, category: 'creative' },
  { key: 'first-story', label: 'Page one', description: 'Started a first story project.', icon: '✧', metric: 'stories.count', threshold: 1, category: 'creative' },
  { key: 'ten-tasks', label: 'Ten done', description: 'Completed ten tasks.', icon: '✓', metric: 'tasks.completed', threshold: 10, category: 'habits' },
  { key: 'task-streak-7', label: 'Seven-day streak', description: 'Finished a task on seven days in a row.', icon: '⚡', metric: 'tasks.streakDays', threshold: 7, category: 'habits' },
  { key: 'first-emotion', label: 'Named it', description: 'Logged a first emotion.', icon: '◍', metric: 'emotionEntries.count', threshold: 1, category: 'care' },
  { key: 'fifty-emotions', label: 'A pattern forms', description: 'Fifty emotions logged.', icon: '◎', metric: 'emotionEntries.count', threshold: 50, category: 'care' },
  { key: 'first-sleep', label: 'Rested', description: 'Logged a first night of sleep.', icon: '☾', metric: 'sleepEntries.count', threshold: 1, category: 'care' },
  { key: 'month-of-tracking', label: 'One month in', description: 'Tracked something on thirty separate days.', icon: '◷', metric: 'trackingDays', threshold: 30, category: 'habits' },
  { key: 'quarter-of-tracking', label: 'Ninety days', description: 'Tracked something on ninety separate days.', icon: '◔', metric: 'trackingDays', threshold: 90, category: 'habits' },
  { key: 'first-backup', label: 'Safely kept', description: 'Exported a first full backup.', icon: '⤓', metric: 'backups.count', threshold: 1, category: 'care' },
  { key: 'first-class', label: 'Enrolled', description: 'Added a first class to School Life.', icon: '🎓', metric: 'classes.count', threshold: 1, category: 'firsts' },
  { key: 'ten-assignments', label: 'On top of it', description: 'Completed ten assignments.', icon: '✔', metric: 'assignments.completed', threshold: 10, category: 'habits' },
  { key: 'first-extracurricular', label: 'Beyond class', description: 'Added a first extracurricular.', icon: '★', metric: 'extracurriculars.count', threshold: 1, category: 'firsts' },
  { key: 'first-study-session', label: 'Heads down', description: 'Logged a first timed study session.', icon: '⏳', metric: 'studySessions.count', threshold: 1, category: 'firsts' },
  { key: 'five-hours-studied', label: 'Putting in the time', description: 'Five hours of study time logged.', icon: '⌛', metric: 'studySessions.hours', threshold: 5, category: 'habits' },
  { key: 'first-school-checkin', label: 'Taking stock', description: 'Logged a first School Life check-in.', icon: '◍', metric: 'schoolCheckIns.count', threshold: 1, category: 'care' },
  { key: 'first-board-post', label: 'Left a note', description: 'Posted to a board for the first time.', icon: '📌', metric: 'boards.count', threshold: 1, category: 'firsts' },
  { key: 'first-bucket-item-done', label: 'Crossed off', description: 'Checked something off the bucket list.', icon: '✓', metric: 'bucketListItems.completed', threshold: 1, category: 'firsts' },
  { key: 'first-watched', label: 'Watched it', description: 'Marked something on the watchlist as watched.', icon: '▶', metric: 'watchlistItems.watched', threshold: 1, category: 'firsts' },
  { key: 'first-kind-word', label: 'A kind word', description: 'Left a note or a compliment for someone.', icon: '✧', metric: 'memberNotes.count', threshold: 1, category: 'firsts' },
  { key: 'first-wellbeing-game', label: 'Played a little', description: 'Tried one of the games in Wellbeing.', icon: '🎲', metric: 'wellbeingGames.count', threshold: 1, category: 'firsts' },
  { key: 'wellbeing-game-streak-7', label: 'A small daily habit', description: 'Played something in Wellbeing on seven days in a row.', icon: '🎯', metric: 'wellbeingGames.streakDays', threshold: 7, category: 'habits' },
  { key: 'first-cycle-entry', label: 'Logged a day', description: 'Added a first entry to Cycle & Wellbeing.', icon: '☽', metric: 'cycleEntries.count', threshold: 1, category: 'care' },
  { key: 'first-symptom', label: 'Noted it', description: 'Logged a first symptom.', icon: '◌', metric: 'symptomEntries.count', threshold: 1, category: 'care' },
];

const BY_KEY = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

export function getAchievement(key: string): AchievementDef | undefined {
  return BY_KEY.get(key);
}

/** Returns the keys newly satisfied by `metrics` that are not already in `unlocked`. */
export function evaluateAchievements(
  metrics: Partial<Record<AchievementMetric, number>>,
  unlocked: ReadonlySet<string>,
): AchievementDef[] {
  return ACHIEVEMENTS.filter(
    (a) => !unlocked.has(a.key) && (metrics[a.metric] ?? 0) >= a.threshold,
  );
}
