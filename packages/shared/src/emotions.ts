/**
 * The emotion catalogue: twelve families, each with sixteen to eighteen words.
 *
 * Breadth is the point — "bad" and "fine" are not enough to notice a pattern in.
 * Families carry the colour so a chart legend can stay readable without relying
 * on hue alone, and every entry keeps a plain-language name. A system can also
 * add its own words on top of this list — see `customEmotions` in the
 * collection registry — for anything this catalogue does not already cover.
 *
 * The twelfth family covers altered and plural-specific states. It is descriptive
 * vocabulary, offered because systems asked for words that fit; nothing here is a
 * symptom list and nothing is interpreted for the user.
 */

export interface EmotionFamily {
  id: string;
  label: string;
  /** Roughly how the family tends to feel. Used for filters, never for judgement. */
  tone: 'pleasant' | 'unpleasant' | 'activating' | 'neutral';
  color: string;
  description: string;
}

export interface Emotion {
  id: string;
  name: string;
  family: string;
  color: string;
  emoji: string;
}

export const EMOTION_FAMILIES: readonly EmotionFamily[] = [
  { id: 'joy', label: 'Joy', tone: 'pleasant', color: '#f2c45a', description: 'Lightness, delight, good news.' },
  { id: 'affection', label: 'Affection', tone: 'pleasant', color: '#f08fb0', description: 'Warmth toward someone.' },
  { id: 'calm', label: 'Calm', tone: 'pleasant', color: '#63c9b4', description: 'Settled, unhurried, safe.' },
  { id: 'confidence', label: 'Confidence', tone: 'activating', color: '#7aa2f7', description: 'Capable and steady.' },
  { id: 'curiosity', label: 'Curiosity', tone: 'activating', color: '#9d8cf0', description: 'Drawn toward something.' },
  { id: 'surprise', label: 'Surprise', tone: 'neutral', color: '#8bd5ff', description: 'Caught off balance.' },
  { id: 'sadness', label: 'Sadness', tone: 'unpleasant', color: '#5f86c4', description: 'Loss, distance, low weather.' },
  { id: 'fear', label: 'Fear', tone: 'unpleasant', color: '#9a86d8', description: 'Threat, real or anticipated.' },
  { id: 'anger', label: 'Anger', tone: 'unpleasant', color: '#e0705f', description: 'Something is wrong and it matters.' },
  { id: 'shame', label: 'Shame', tone: 'unpleasant', color: '#c47fa0', description: 'Turned inward, self-directed.' },
  { id: 'fatigue', label: 'Fatigue', tone: 'unpleasant', color: '#8a93a8', description: 'Out of capacity.' },
  { id: 'altered', label: 'Altered states', tone: 'neutral', color: '#6fb0d4', description: 'Distance from the body, the moment, or each other.' },
];

const FAMILY_MEMBERS: Record<string, readonly (readonly [string, string])[]> = {
  joy: [
    ['Happy', '🙂'], ['Delighted', '😄'], ['Cheerful', '😊'], ['Playful', '😜'],
    ['Excited', '🤩'], ['Elated', '🎉'], ['Content', '😌'], ['Amused', '😁'],
    ['Hopeful', '🌤'], ['Optimistic', '🌱'], ['Proud', '🏅'], ['Euphoric', '✨'],
    ['Silly', '🤪'], ['Giddy', '🥳'], ['Satisfied', '😋'], ['Lighthearted', '🎈'],
    ['Blissful', '🌤'], ['Jubilant', '🎊'],
  ],
  affection: [
    ['Loved', '💗'], ['Loving', '💞'], ['Affectionate', '🤗'], ['Warm', '🔥'],
    ['Tender', '🌸'], ['Compassionate', '🕊'], ['Grateful', '🙏'], ['Trusting', '🤝'],
    ['Connected', '🔗'], ['Adored', '💖'], ['Protective', '🛡'], ['Devoted', '💫'],
    ['Nostalgic', '📼'], ['Sentimental', '🎞'], ['Appreciative', '🌼'], ['Close', '🫂'],
    ['Cherished', '🎁'], ['Fond', '🧣'],
  ],
  calm: [
    ['Calm', '🌊'], ['Relaxed', '🛋'], ['Peaceful', '🕯'], ['Grounded', '🪨'],
    ['Serene', '🏞'], ['Safe', '🏠'], ['Settled', '⚓'], ['Comfortable', '🧸'],
    ['Rested', '🌙'], ['Still', '🫧'], ['Balanced', '⚖'], ['Soothed', '🍵'],
    ['Unhurried', '🐢'], ['Centred', '🧘'], ['At ease', '🌾'], ['Quiet', '🤫'],
    ['Steady', '🪵'], ['Clear-headed', '🌤'],
  ],
  confidence: [
    ['Confident', '💪'], ['Capable', '🧰'], ['Determined', '🎯'], ['Motivated', '🚀'],
    ['Focused', '🔍'], ['Empowered', '⚡'], ['Assertive', '📣'], ['Brave', '🦁'],
    ['Resilient', '🌵'], ['Accomplished', '🏆'], ['Secure', '🔒'], ['Purposeful', '🧭'],
    ['Independent', '🗽'], ['Driven', '🏹'], ['In control', '🎛'], ['Steadfast', '⛰'],
    ['Ambitious', '📈'], ['Self-assured', '🪞'],
  ],
  curiosity: [
    ['Curious', '🔭'], ['Interested', '📖'], ['Inspired', '💡'], ['Creative', '🎨'],
    ['Engaged', '🧩'], ['Intrigued', '🕵'], ['Attentive', '👀'], ['Imaginative', '🌈'],
    ['Absorbed', '🌀'], ['Fascinated', '🔮'], ['Inventive', '🛠'], ['Reflective', '🪞'],
    ['Playfully curious', '🐈'], ['Exploratory', '🧭'], ['Wondering', '🌌'], ['Open-minded', '🚪'],
    ['Eager', '🐇'], ['Adventurous', '🗺'],
  ],
  surprise: [
    ['Surprised', '😮'], ['Startled', '😳'], ['Astonished', '😲'], ['Amazed', '🤯'],
    ['Stunned', '😶'], ['Shocked', '⚡'], ['Bewildered', '❓'], ['Disoriented', '🌫'],
    ['Speechless', '🤐'], ['Unsettled', '〰'], ['Blindsided', '💥'], ['Awestruck', '🌌'],
    ['Caught off guard', '🎯'], ['Wide-eyed', '👁'], ['Rattled', '🫨'], ['Thrown', '🎢'],
  ],
  sadness: [
    ['Sad', '😢'], ['Low', '🌧'], ['Lonely', '🌑'], ['Grieving', '🥀'],
    ['Heartbroken', '💔'], ['Disappointed', '📉'], ['Hopeless', '🕳'], ['Melancholy', '🎻'],
    ['Homesick', '🏚'], ['Tearful', '💧'], ['Empty', '⬜'], ['Wistful', '🍂'],
    ['Discouraged', '🌫'], ['Longing', '🌒'], ['Rueful', '↩'], ['Deflated', '🎈'],
    ['Isolated', '🏝'], ['Numb', '🧊'],
  ],
  fear: [
    ['Afraid', '😨'], ['Anxious', '😰'], ['Nervous', '😬'], ['Worried', '🤔'],
    ['Panicked', '🚨'], ['Tense', '🪢'], ['Uneasy', '🌘'], ['Dreading', '⏳'],
    ['Insecure', '🪫'], ['Hypervigilant', '📡'], ['Terrified', '😱'], ['Apprehensive', '🚪'],
    ['On edge', '🔪'], ['Overwhelmed by fear', '🌊'], ['Wary', '🦉'], ['Jumpy', '🐇'],
    ['Timid', '🐁'], ['Threatened', '⚠'],
  ],
  anger: [
    ['Angry', '😠'], ['Irritated', '😤'], ['Frustrated', '😖'], ['Resentful', '🧊'],
    ['Annoyed', '🙄'], ['Furious', '🌋'], ['Defensive', '🧱'], ['Impatient', '⏰'],
    ['Bitter', '🫗'], ['Indignant', '⚔'], ['Agitated', '📳'], ['Provoked', '🎣'],
    ['Fed up', '🚫'], ['Seething', '🔥'], ['Betrayed', '🗡'], ['Contemptuous', '🙅'],
    ['Hostile', '🐺'], ['Vindictive', '🎭'],
  ],
  shame: [
    ['Ashamed', '😞'], ['Guilty', '⚖'], ['Embarrassed', '😅'], ['Regretful', '↩'],
    ['Self-critical', '🔨'], ['Humiliated', '🫥'], ['Exposed', '🪟'], ['Inadequate', '📏'],
    ['Remorseful', '🕯'], ['Unworthy', '🥄'], ['Self-conscious', '👁'], ['Apologetic', '🙇'],
    ['Mortified', '🫣'], ['Awkward', '🦆'], ['Disgraced', '🕸'], ['Small', '🐜'],
  ],
  fatigue: [
    ['Tired', '😴'], ['Exhausted', '🪹'], ['Drained', '🔋'], ['Burned out', '🕯'],
    ['Sluggish', '🐌'], ['Overwhelmed', '🌊'], ['Brain-fogged', '🌁'], ['Weak', '🍃'],
    ['Depleted', '🏜'], ['Listless', '🫙'], ['Heavy', '🪨'], ['Overstimulated', '🔊'],
    ['Worn out', '🕰'], ['Stretched thin', '🪢'], ['Foggy', '🌫'], ['Flat', '📉'],
    ['Under-slept', '🌙'], ['Spent', '🕳'],
  ],
  altered: [
    ['Dissociated', '🌫'], ['Detached', '🎈'], ['Unreal', '🪞'], ['Blurry', '💨'],
    ['Distant', '🛰'], ['Blended', '🌗'], ['Co-conscious', '👥'], ['Switchy', '🔄'],
    ['Spaced out', '🌠'], ['Disconnected', '🔌'], ['Pulled back', '↩'], ['Watching from outside', '🪟'],
    ['Front-locked', '🔒'], ['Foggy inside', '🌁'], ['Time-lost', '⌛'], ['Fronting fatigue', '🪫'],
    ['Grounded in the body', '🌳'], ['Present', '📍'],
  ],
};

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export const EMOTIONS: readonly Emotion[] = EMOTION_FAMILIES.flatMap((family) =>
  (FAMILY_MEMBERS[family.id] ?? []).map(([name, emoji]) => ({
    id: `${family.id}.${slug(name)}`,
    name,
    family: family.id,
    color: family.color,
    emoji,
  })),
);

const EMOTIONS_BY_ID = new Map(EMOTIONS.map((e) => [e.id, e]));
const FAMILIES_BY_ID = new Map(EMOTION_FAMILIES.map((fam) => [fam.id, fam]));

export function getEmotion(id: string): Emotion | undefined {
  return EMOTIONS_BY_ID.get(id);
}

export function getEmotionFamily(id: string): EmotionFamily | undefined {
  return FAMILIES_BY_ID.get(id);
}

export function emotionsInFamily(familyId: string): Emotion[] {
  return EMOTIONS.filter((e) => e.family === familyId);
}

export function searchEmotions(query: string): Emotion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...EMOTIONS];
  return EMOTIONS.filter((e) => e.name.toLowerCase().includes(q) || e.family.includes(q));
}

/** Labels for the 1–5 intensity scale, so the number always arrives with a word. */
export const INTENSITY_LABELS: readonly string[] = [
  'Barely there',
  'Mild',
  'Moderate',
  'Strong',
  'Overwhelming',
];

export function intensityLabel(level: number): string {
  return INTENSITY_LABELS[Math.min(Math.max(Math.round(level), 1), 5) - 1] ?? 'Moderate';
}

/** Regions used by the body-sensation outline. Plain anatomy, no interpretation. */
export const BODY_REGIONS: readonly { id: string; label: string }[] = [
  { id: 'head', label: 'Head' },
  { id: 'face', label: 'Face' },
  { id: 'jaw', label: 'Jaw' },
  { id: 'throat', label: 'Throat' },
  { id: 'neck', label: 'Neck' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'chest', label: 'Chest' },
  { id: 'heart', label: 'Heart area' },
  { id: 'upper-back', label: 'Upper back' },
  { id: 'arms', label: 'Arms' },
  { id: 'hands', label: 'Hands' },
  { id: 'stomach', label: 'Stomach' },
  { id: 'lower-back', label: 'Lower back' },
  { id: 'hips', label: 'Hips' },
  { id: 'legs', label: 'Legs' },
  { id: 'knees', label: 'Knees' },
  { id: 'feet', label: 'Feet' },
  { id: 'skin', label: 'Skin (all over)' },
  { id: 'whole-body', label: 'Whole body' },
];

export const SENSATION_WORDS: readonly string[] = [
  'Tight', 'Aching', 'Buzzing', 'Numb', 'Warm', 'Cold', 'Heavy', 'Light',
  'Fluttering', 'Churning', 'Sharp', 'Dull', 'Tingling', 'Pressure', 'Empty',
  'Full', 'Restless', 'Still', 'Shaky', 'Tense', 'Loose', 'Prickling',
];
