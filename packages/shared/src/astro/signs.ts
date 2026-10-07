import type { PlanetId, SignName } from './ephemeris.js';

export type Element = 'Fire' | 'Earth' | 'Air' | 'Water';
export type Modality = 'Cardinal' | 'Fixed' | 'Mutable';

export const TOPICS = [
  'personality', 'emotional', 'communication', 'relationships', 'creativity',
  'motivation', 'strengths', 'challenges', 'social', 'growth',
] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  personality: 'Personality',
  emotional: 'Emotional patterns',
  communication: 'Communication',
  relationships: 'Relationships',
  creativity: 'Creativity',
  motivation: 'Motivation',
  strengths: 'Strengths',
  challenges: 'Challenges',
  social: 'Social tendencies',
  growth: 'Personal growth',
};

export interface SignInfo {
  name: SignName;
  glyph: string;
  element: Element;
  modality: Modality;
  ruler: string;
  /** Tropical start (month 1–12, day). */
  starts: [number, number];
  dates: string;
  keywords: string[];
  summary: string;
  topics: Record<Topic, string>;
}

const s = (
  name: SignName, glyph: string, element: Element, modality: Modality, ruler: string,
  starts: [number, number], dates: string, keywords: string[], summary: string, topics: string[],
): SignInfo => ({
  name, glyph, element, modality, ruler, starts, dates, keywords, summary,
  topics: Object.fromEntries(TOPICS.map((t, i) => [t, topics[i]!])) as Record<Topic, string>,
});

export const SIGNS: readonly SignInfo[] = [
  s('Aries', '♈', 'Fire', 'Cardinal', 'Mars', [3, 21], 'Mar 21 – Apr 19', ['bold', 'direct', 'pioneering'],
    'The first sign: initiative, courage and a straight-to-the-point way of starting things.',
    ['a direct, energetic presence that likes to lead and begin', 'feelings arrive fast and burn bright, then settle quickly', 'blunt, honest and quick — says it plainly', 'wants passion and honesty, and dislikes games', 'spontaneous, hands-on, and happiest when making something happen', 'new challenges and the thrill of a fresh start', 'courage, drive and a willingness to go first', 'impatience and a short fuse when things stall', 'enjoys lively company and healthy competition', 'learning patience and finishing what is started']),
  s('Taurus', '♉', 'Earth', 'Fixed', 'Venus', [4, 20], 'Apr 20 – May 20', ['steady', 'sensual', 'loyal'],
    'Grounded and devoted: comfort, beauty, patience and a love of the tangible.',
    ['a calm, dependable presence with a taste for comfort', 'slow to stir, deep when moved, and soothed by routine and the senses', 'unhurried and considered — says what it means', 'loyal and affectionate, wanting steadiness and trust', 'drawn to craft, texture, taste and making things lovely', 'security, comfort and the satisfaction of steady progress', 'reliability, patience and practical good sense', 'stubbornness and resistance to change', 'prefers a few trusted people and cosy gatherings', 'learning flexibility and trusting change']),
  s('Gemini', '♊', 'Air', 'Mutable', 'Mercury', [5, 21], 'May 21 – Jun 20', ['curious', 'quick', 'talkative'],
    'The communicator: curiosity, wit, variety and a mind that loves to connect ideas.',
    ['a curious, adaptable presence with many interests', 'feelings are processed by talking and thinking them through', 'quick, witty and expressive, with plenty to say', 'wants mental connection and conversation', 'ideas, words, wordplay and mixing influences', 'novelty, learning and keeping things interesting', 'adaptability, wit and quick learning', 'restlessness and scattered focus', 'sociable and easily at home in many circles', 'learning depth, focus and follow-through']),
  s('Cancer', '♋', 'Water', 'Cardinal', 'the Moon', [6, 21], 'Jun 21 – Jul 22', ['nurturing', 'protective', 'intuitive'],
    'The caretaker: feeling, home, memory and protective tenderness.',
    ['a caring, protective presence that values home and belonging', 'tides of feeling, strongly tied to memory and atmosphere', 'speaks from the heart, often indirectly or through care', 'devoted and nurturing, needing emotional safety', 'imaginative, nostalgic and good at making spaces feel warm', 'protecting loved ones and building a safe base', 'empathy, intuition and loyalty', 'moodiness and retreating into a shell', 'close-knit; prefers a chosen inner circle', 'learning to receive care and let go of the past']),
  s('Leo', '♌', 'Fire', 'Fixed', 'the Sun', [7, 23], 'Jul 23 – Aug 22', ['radiant', 'generous', 'expressive'],
    'The performer: warmth, creativity, pride and a generous, big-hearted spirit.',
    ['a warm, confident presence that likes to shine', 'big, heartfelt feelings that want to be seen and appreciated', 'expressive and dramatic in a warm way', 'loyal, generous and affectionate, needing appreciation', 'bold self-expression, play, performance and art', 'recognition, joy and living with heart', 'generosity, warmth and natural charisma', 'pride and sensitivity to being overlooked', 'enjoys being at the centre of a lively circle', 'learning humility and giving without needing applause']),
  s('Virgo', '♍', 'Earth', 'Mutable', 'Mercury', [8, 23], 'Aug 23 – Sep 22', ['analytical', 'helpful', 'precise'],
    'The refiner: service, discernment, craft and a care for useful detail.',
    ['a thoughtful, modest presence that notices details', 'feelings are managed by sorting, fixing and being useful', 'precise, clear and practical, with a careful choice of words', 'shows love through acts of service and attention', 'careful craft, editing and perfecting small things', 'improvement, usefulness and doing things well', 'diligence, observation and problem-solving', 'perfectionism and harsh self-criticism', 'selective and quietly supportive in groups', 'learning self-compassion and accepting imperfection']),
  s('Libra', '♎', 'Air', 'Cardinal', 'Venus', [9, 23], 'Sep 23 – Oct 22', ['harmonious', 'diplomatic', 'aesthetic'],
    'The balancer: relationship, fairness, beauty and the search for harmony.',
    ['a graceful, fair-minded presence that seeks balance', 'feelings are tied to harmony in the room and in relationships', 'tactful and diplomatic, weighing every side', 'values partnership, fairness and mutual care', 'a strong eye for beauty, design and balance', 'harmony, fairness and meaningful connection', 'diplomacy, charm and a gift for seeing both sides', 'indecision and avoiding conflict to keep the peace', 'easy in company and good at bringing people together', 'learning to choose for yourself and tolerate friction']),
  s('Scorpio', '♏', 'Water', 'Fixed', 'Pluto (and Mars)', [10, 23], 'Oct 23 – Nov 21', ['intense', 'perceptive', 'transformative'],
    'The transformer: depth, privacy, passion and a capacity to see beneath surfaces.',
    ['an intense, private presence with magnetic depth', 'deep, powerful feelings that are guarded until trust is earned', 'direct and probing, preferring meaningful talk to small talk', 'wants loyalty, honesty and real depth', 'dramatic, symbolic, and drawn to the hidden and mysterious', 'truth, depth and meaningful transformation', 'resilience, perception and fierce loyalty', 'jealousy, secrecy and holding on to hurt', 'selective; a few deep bonds over many light ones', 'learning trust, release and gentle vulnerability']),
  s('Sagittarius', '♐', 'Fire', 'Mutable', 'Jupiter', [11, 22], 'Nov 22 – Dec 21', ['adventurous', 'optimistic', 'philosophical'],
    'The explorer: freedom, meaning, humour and a hunger for wider horizons.',
    ['an open, optimistic presence that loves freedom and ideas', 'feelings are lifted by movement, laughter and perspective', 'frank, funny and storytelling, sometimes too blunt', 'wants a companion in adventure and room to roam', 'big-picture ideas, travel, stories and philosophy', 'exploration, meaning and growing beyond limits', 'optimism, honesty and enthusiasm', 'restlessness and over-promising', 'friendly, open and quick to befriend newcomers', 'learning commitment and attention to detail']),
  s('Capricorn', '♑', 'Earth', 'Cardinal', 'Saturn', [12, 22], 'Dec 22 – Jan 19', ['disciplined', 'ambitious', 'steady'],
    'The builder: structure, responsibility, patience and long-term ambition.',
    ['a composed, responsible presence with quiet ambition', 'feelings are kept contained and shown through reliability', 'measured, dry-humoured and to the point', 'slow to open, deeply committed once settled', 'structured, disciplined craft and long-form projects', 'achievement, mastery and building something lasting', 'discipline, patience and practical strategy', 'overwork, pessimism and difficulty relaxing', 'reserved at first; loyal and dependable over time', 'learning rest, play and asking for support']),
  s('Aquarius', '♒', 'Air', 'Fixed', 'Saturn (and Uranus)', [1, 20], 'Jan 20 – Feb 18', ['original', 'independent', 'humanitarian'],
    'The visionary: originality, independence, community and ideas ahead of their time.',
    ['an independent, unconventional presence with its own point of view', 'feelings are often processed intellectually and at some distance', 'clear, idea-driven and happy to debate concepts', 'wants friendship at the heart of closeness, plus freedom', 'inventive, experimental and future-minded', 'ideals, independence and improving things for everyone', 'originality, objectivity and loyalty to values', 'detachment and stubborn contrarianism', 'at home in groups, communities and online spaces', 'learning emotional openness and closeness']),
  s('Pisces', '♓', 'Water', 'Mutable', 'Neptune (and Jupiter)', [2, 19], 'Feb 19 – Mar 20', ['dreamy', 'empathic', 'imaginative'],
    'The dreamer: empathy, imagination, spirituality and a porous, poetic sensitivity.',
    ['a gentle, imaginative presence that blends with its surroundings', 'feelings are absorbed from everywhere and can be oceanic', 'intuitive and poetic, sometimes hard to pin down', 'devoted, compassionate and romantic', 'dreamlike art, music, story and fantasy', 'compassion, escape into beauty and something larger than self', 'empathy, imagination and compassion', 'overwhelm, escapism and blurry boundaries', 'soft with others, needing quiet time to recharge', 'learning boundaries and grounding']),
];

export function signInfo(name: SignName): SignInfo {
  return SIGNS.find((sign) => sign.name === name)!;
}

/** Tropical Sun sign from a month/day — the only thing a bare birthday needs. */
export function sunSignFor(month: number, day: number): SignName {
  // Walk backwards through the sign start dates to find the last one on or before the date.
  const ordered = [...SIGNS].sort((a, b) => a.starts[0] * 100 + a.starts[1] - (b.starts[0] * 100 + b.starts[1]));
  const key = month * 100 + day;
  let found = ordered[ordered.length - 1]!; // before Jan 20 → Capricorn
  for (const sign of ordered) {
    if (sign.starts[0] * 100 + sign.starts[1] <= key) found = sign;
  }
  return found.name;
}

export interface PlanetInfo {
  id: PlanetId;
  name: string;
  glyph: string;
  represents: string;
  /** Short lead-in for each interpretation topic, completed with the sign's phrase. */
  lens: Record<Topic, string>;
}

const lens = (p: string, e: string, c: string, r: string, cr: string, m: string, st: string, ch: string, so: string, g: string): Record<Topic, string> => ({
  personality: p, emotional: e, communication: c, relationships: r, creativity: cr,
  motivation: m, strengths: st, challenges: ch, social: so, growth: g,
});

export const PLANETS: readonly PlanetInfo[] = [
  { id: 'sun', name: 'Sun', glyph: '☉', represents: 'core identity, vitality, purpose and how you shine', lens: lens('Core self:', 'Emotional centre:', 'Self-expression:', 'In closeness:', 'Creative spark:', 'What drives you:', 'Natural gifts:', 'Where it can trip you:', 'Out in the world:', 'Growth edge:') },
  { id: 'moon', name: 'Moon', glyph: '☽', represents: 'emotions, instincts, comfort, memory and what helps you feel safe', lens: lens('Inner nature:', 'Emotional patterns:', 'Speaking from feeling:', 'Needs in closeness:', 'Imagination:', 'What soothes and sustains you:', 'Emotional gifts:', 'Emotional sore spots:', 'Social comfort:', 'Emotional growth:') },
  { id: 'mercury', name: 'Mercury', glyph: '☿', represents: 'thinking, learning, speech, writing and how you process information', lens: lens('Mind:', 'Thinking about feelings:', 'Communication style:', 'Talking in closeness:', 'Ideas and writing:', 'Curiosity:', 'Mental gifts:', 'Mental traps:', 'Conversation:', 'Learning to grow:') },
  { id: 'venus', name: 'Venus', glyph: '♀', represents: 'relationships, affection, attraction, values and aesthetics', lens: lens('Charm:', 'Affection:', 'Warmth in words:', 'Love and attraction:', 'Aesthetic sense:', 'What you value:', 'Gifts in connection:', 'Relationship snags:', 'Friendship style:', 'Growth in love:') },
  { id: 'mars', name: 'Mars', glyph: '♂', represents: 'drive, action, assertiveness, anger and desire', lens: lens('Drive:', 'Anger and passion:', 'Assertiveness:', 'Pursuit and desire:', 'Creative energy:', 'Ambition:', 'Strength:', 'Friction points:', 'Energy in groups:', 'Channelling energy:') },
  { id: 'jupiter', name: 'Jupiter', glyph: '♃', represents: 'growth, luck, optimism, belief and expansion', lens: lens('Outlook:', 'Hope:', 'Enthusiasm:', 'Generosity:', 'Inspiration:', 'Where you reach:', 'Gifts of growth:', 'Overdoing it:', 'Generous company:', 'Expanding wisely:') },
  { id: 'saturn', name: 'Saturn', glyph: '♄', represents: 'structure, responsibility, limits, discipline and lessons that take time', lens: lens('Lessons:', 'Guardedness:', 'Careful speech:', 'Commitment:', 'Craft and discipline:', 'Long-term goals:', 'Hard-won strength:', 'Fear and pressure:', 'Boundaries:', 'Maturing:') },
  { id: 'uranus', name: 'Uranus', glyph: '♅', represents: 'change, individuality, surprise and breaking patterns (shared by a whole generation)', lens: lens('Generational spark:', 'Restlessness:', 'Original ideas:', 'Need for freedom:', 'Innovation:', 'Reinvention:', 'Originality:', 'Disruption:', 'Your generation:', 'Embracing change:') },
  { id: 'neptune', name: 'Neptune', glyph: '♆', represents: 'dreams, intuition, imagination and idealism (shared by a whole generation)', lens: lens('Generational dream:', 'Sensitivity:', 'Intuitive speech:', 'Ideals:', 'Imagination:', 'Inspiration:', 'Compassion:', 'Illusion:', 'Collective mood:', 'Grounding dreams:') },
  { id: 'pluto', name: 'Pluto', glyph: '♇', represents: 'transformation, power, endings and rebirth (shared by a whole generation)', lens: lens('Generational depth:', 'Intensity:', 'Powerful words:', 'Deep bonds:', 'Transformative art:', 'Renewal:', 'Resilience:', 'Control:', 'Collective change:', 'Transforming:') },
  { id: 'northNode', name: 'North Node', glyph: '☊', represents: 'a traditional pointer toward growth and the direction of development', lens: lens('Direction:', 'Growing into:', 'Learning to say:', 'Growing together:', 'Reaching for:', 'Calling:', 'Developing:', 'Resisting:', 'Seeking out:', 'Path:') },
  { id: 'chiron', name: 'Chiron', glyph: '⚷', represents: 'the "wounded healer": sensitive spots that can become sources of compassion (approximate here)', lens: lens('Tender spot:', 'Old hurt:', 'Hard to say:', 'Vulnerability:', 'Healing art:', 'Healing:', 'Compassion:', 'Sensitive to:', 'Feeling like an outsider:', 'Healing path:') },
];

export function planetInfo(id: PlanetId): PlanetInfo {
  return PLANETS.find((p) => p.id === id)!;
}

export const HOUSES: { n: number; name: string; theme: string }[] = [
  { n: 1, name: '1st house', theme: 'self, appearance and first impressions' },
  { n: 2, name: '2nd house', theme: 'values, money and possessions' },
  { n: 3, name: '3rd house', theme: 'communication, siblings and daily learning' },
  { n: 4, name: '4th house', theme: 'home, family and roots' },
  { n: 5, name: '5th house', theme: 'creativity, play and romance' },
  { n: 6, name: '6th house', theme: 'routines, work and wellbeing' },
  { n: 7, name: '7th house', theme: 'partnerships and one-to-one relationships' },
  { n: 8, name: '8th house', theme: 'intimacy, shared resources and transformation' },
  { n: 9, name: '9th house', theme: 'travel, beliefs and higher learning' },
  { n: 10, name: '10th house', theme: 'career, reputation and public life' },
  { n: 11, name: '11th house', theme: 'friends, community and hopes' },
  { n: 12, name: '12th house', theme: 'rest, the subconscious and retreat' },
];

export const DISCLAIMER =
  'Astrology is a traditional symbolic system, not a science. These readings are astrology-inspired prompts for self-reflection and entertainment — not predictions, advice or a measure of who anyone is.';

export const ELEMENT_EMOJI: Record<Element, string> = { Fire: '🔥', Earth: '🌿', Air: '💨', Water: '💧' };
