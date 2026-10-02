/**
 * Small, curated pools of warm, low-key copy — no generation, no AI, just
 * sentences written in advance and picked from. `pickDaily` is deterministic
 * by date, so the whole system sees the same line on the same day rather
 * than a new one on every page load; `pickRandom` is for an on-demand pick,
 * like a "give me a fortune" button.
 */

export const DAILY_MESSAGES: readonly string[] = [
  'The constellation is looking lively today.',
  'You made it through another day together.',
  'Every light here is one of you.',
  'Still here, still together.',
  "Another day logged, another day shared.",
  "Whoever's out today, welcome.",
  'Some days are quiet. This can be one of them.',
  "The system's a little brighter with you in it.",
  'Nothing has to happen today for today to count.',
  "However today's going, you're doing it together.",
  'A home with more than one light on.',
  "You don't have to do anything with this message. It's just here.",
  "Someone's probably thinking of someone else in here right now.",
  "Today's as good a day as any to leave a note for later.",
  'Not every day needs a reason to be a good one.',
  'The constellation keeps its shape, even on the quiet days.',
];

export const FORTUNES: readonly string[] = [
  'Today might surprise you. Or it might not. Either is fine.',
  'Something small will probably go right today.',
  'A good moment is due. No pressure on when.',
  "You're allowed to have an uneventful day.",
  'Something you forgot about might turn out to matter.',
  'The next conversation you have could be a good one.',
  "There's no rush on anything today.",
  "A small thing today will be worth remembering, even if you don't notice it yet.",
  'Today has at least one good five minutes in it.',
  "Whatever you're waiting on is a little closer than it was yesterday.",
  'Someone out there is glad you exist. Possibly someone in here.',
  'A quiet day is still a day that counted.',
  "You might like something today that you didn't expect to.",
  "It's a fine day to be gentle with yourself.",
  'The universe has no particular plans for you today, which is its own kind of relief.',
  'Something ordinary today will turn out to have been worth it.',
];

export const COMPLIMENTS: readonly string[] = [
  "You're doing better than you think you are.",
  'Showing up today counts for something.',
  "You've gotten through every hard day so far. That's not nothing.",
  'Someone appreciates the way you do things.',
  'You make this place feel more like a home.',
  "You're allowed to be proud of something small today.",
  'The system is lucky to have you in it.',
  'You handled more today than anyone noticed.',
  "You're easy to be around, even on your quiet days.",
  "Whatever you're carrying, you're carrying it well.",
  "You've grown into someone worth knowing.",
  'Your effort today mattered, even if nothing came of it yet.',
  'You bring something to this system that nobody else does.',
  "It's good that you're here.",
  "You don't have to earn rest to deserve it.",
  "Somebody in here is grateful for you, even if they haven't said so.",
];

/** A simple, stable hash — good enough to spread dates across a short pool evenly, nothing more. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** The same pick for everyone, all day — changes only when the calendar date does. */
export function pickDaily(pool: readonly string[], date: Date = new Date()): string {
  const dateKey = date.toISOString().slice(0, 10);
  return pool[hashString(dateKey) % pool.length] ?? pool[0] ?? '';
}

export function pickRandom(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? '';
}
