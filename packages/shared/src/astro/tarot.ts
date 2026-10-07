import { hashSeed, rng } from './horoscope.js';

export const TAROT_DISCLAIMER =
  'Tarot here is reflective, entertainment guidance — a prompt for thinking and journaling, not a prediction or guarantee of any future event.';

export interface TarotCard {
  id: string;
  name: string;
  arcana: 'major' | 'minor';
  glyph: string;
  upright: string;
  reversed: string;
  reflection: string;
  relationship: string;
  growth: string;
}

const major = (n: number, name: string, glyph: string, upright: string, reversed: string, reflection: string, relationship: string, growth: string): TarotCard => ({
  id: `major-${n}`, name, arcana: 'major', glyph, upright, reversed, reflection, relationship, growth,
});

const MAJORS: TarotCard[] = [
  major(0, 'The Fool', '🌅', 'New beginnings, open-hearted trust, a leap of faith.', 'Hesitation, recklessness, or fear of starting.', 'What new thing am I curious about right now?', 'Meet others with openness and play.', 'Growth comes from being willing to begin before you feel ready.'),
  major(1, 'The Magician', '✨', 'Resourcefulness, focus and turning ideas into action.', 'Scattered effort, doubt in your own skills.', 'What tools do I already have?', 'Clear, intentional communication builds connection.', 'Use what you have, deliberately.'),
  major(2, 'The High Priestess', '🌙', 'Intuition, quiet knowing and the unspoken.', 'Ignoring your inner voice, secrets, confusion.', 'What do I already know but have not said?', 'Listen for what is felt beneath the words.', 'Trust and practise listening inward.'),
  major(3, 'The Empress', '🌿', 'Nurture, abundance, creativity and comfort.', 'Overgiving, creative block, neglecting yourself.', 'How can I care for myself the way I care for others?', 'Warmth and generosity feed bonds.', 'Let yourself receive as well as give.'),
  major(4, 'The Emperor', '🏛️', 'Structure, stability and steady leadership.', 'Rigidity, control, or lack of boundaries.', 'Where do I need a firmer boundary or plan?', 'Reliability and clear limits create safety.', 'Build structure that supports rather than confines you.'),
  major(5, 'The Hierophant', '📜', 'Tradition, learning and shared values.', 'Questioning convention, breaking with expectations.', 'Which beliefs of mine are truly mine?', 'Shared values deepen trust.', 'Seek mentors, and also your own way.'),
  major(6, 'The Lovers', '💞', 'Connection, values-led choices and harmony.', 'Misalignment, indecision, disconnection.', 'What choice reflects my values?', 'Honest alignment matters more than perfect agreement.', 'Choose from your values, not from pressure.'),
  major(7, 'The Chariot', '🏇', 'Determination, direction and willpower.', 'Lost direction, scattered drive.', 'What am I steering toward?', 'Move together by agreeing on direction.', 'Discipline and focus carry you forward.'),
  major(8, 'Strength', '🦁', 'Gentle courage, patience and compassion.', 'Self-doubt, depleted energy, forcing things.', 'Where can gentleness be my strength?', 'Patience and kindness soothe tension.', 'True strength includes softness.'),
  major(9, 'The Hermit', '🏮', 'Solitude, reflection and inner guidance.', 'Isolation, withdrawing too far, loneliness.', 'What do I need quiet time to figure out?', 'Space can be a gift when named kindly.', 'Seek insight in stillness, then share it.'),
  major(10, 'Wheel of Fortune', '🎡', 'Cycles, change and turning points.', 'Resisting change, feeling stuck in a loop.', 'What cycle am I in right now?', 'Relationships move through seasons too.', 'Flow with change while choosing what you can.'),
  major(11, 'Justice', '⚖️', 'Fairness, truth and accountability.', 'Avoiding responsibility, unfairness, bias.', 'Am I being fair to myself and others?', 'Honest, fair exchange strengthens trust.', 'Own your choices clearly.'),
  major(12, 'The Hanged Man', '🙃', 'Pause, surrender and a new perspective.', 'Stalling, resisting a needed pause.', 'What changes if I look at this differently?', 'Step back and see the other side.', 'Let go of control to see more.'),
  major(13, 'Death', '🌑', 'Endings, transformation and clearing space.', 'Clinging to what has finished.', 'What is ready to end so something new can start?', 'Relationships can evolve or conclude gracefully.', 'Release makes room for renewal.'),
  major(14, 'Temperance', '🏺', 'Balance, moderation and patience.', 'Imbalance, excess, impatience.', 'Where do I need to blend or moderate?', 'Compromise and patience harmonise.', 'Aim for sustainable balance.'),
  major(15, 'The Devil', '⛓️', 'Attachment, habits and the pull of temptation.', 'Breaking free, reclaiming power.', 'What habit or pattern has a hold on me?', 'Notice unhealthy patterns or dependency.', 'Awareness is the first step to freedom.'),
  major(16, 'The Tower', '⚡', 'Sudden change, upheaval and revelation.', 'Avoiding necessary change, delayed upheaval.', 'What truth is shaking loose?', 'Honest reckonings can clear the air.', 'Rebuild on firmer ground.'),
  major(17, 'The Star', '⭐', 'Hope, healing and renewal.', 'Discouragement, losing faith.', 'What gives me hope?', 'Gentle, hopeful presence heals.', 'Nurture hope in small, steady ways.'),
  major(18, 'The Moon', '🌘', 'Intuition, dreams and uncertainty.', 'Clarity emerging, fears loosening.', 'What am I unsure of, and what is just fear?', 'Notice what is imagined and what is real.', 'Move gently through uncertainty.'),
  major(19, 'The Sun', '☀️', 'Joy, vitality and clarity.', 'Dimmed joy, temporary gloom.', 'What brings me simple joy?', 'Shared joy and honesty light things up.', 'Let yourself be seen and enjoy it.'),
  major(20, 'Judgement', '📯', 'Awakening, reflection and a call to renew.', 'Self-doubt, avoiding the call.', 'What am I being called to reconsider?', 'Forgiveness and fresh starts.', 'Reflect, forgive, rise.'),
  major(21, 'The World', '🌍', 'Completion, wholeness and fulfilment.', 'Loose ends, almost-there.', 'What have I completed, and what is next?', 'Feeling whole together.', 'Celebrate, then begin again.'),
];

const SUITS = [
  { id: 'wands', name: 'Wands', glyph: '🔥', theme: 'passion, drive and creativity' },
  { id: 'cups', name: 'Cups', glyph: '💧', theme: 'feelings, love and intuition' },
  { id: 'swords', name: 'Swords', glyph: '🗡️', theme: 'thought, truth and communication' },
  { id: 'pentacles', name: 'Pentacles', glyph: '🪙', theme: 'work, body and material life' },
] as const;

const RANKS = [
  ['Ace', 'a seed of new potential', 'a missed or blocked beginning'],
  ['Two', 'balance, choices and partnership', 'indecision or imbalance'],
  ['Three', 'growth, collaboration and early results', 'friction or delays in collaboration'],
  ['Four', 'stability, rest and consolidation', 'restlessness or stagnation'],
  ['Five', 'challenge, conflict and learning through difficulty', 'recovering from conflict'],
  ['Six', 'harmony, support and moving forward', 'unevenness or looking back too much'],
  ['Seven', 'reflection, assessment and perseverance', 'doubt or scattered effort'],
  ['Eight', 'movement, mastery and effort', 'burnout or lack of direction'],
  ['Nine', 'near-completion, resilience and self-reliance', 'fatigue or anxiety near the finish'],
  ['Ten', 'completion, fullness and a cycle\'s end', 'overload or an unfinished cycle'],
  ['Page', 'curiosity, messages and beginner\'s mind', 'immaturity or unclear messages'],
  ['Knight', 'pursuit, energy and committed action', 'impulsiveness or stalled action'],
  ['Queen', 'nurturing mastery and inner command', 'withheld care or self-doubt'],
  ['King', 'authority, experience and steady command', 'domineering or detached control'],
] as const;

const MINORS: TarotCard[] = SUITS.flatMap((suit) =>
  RANKS.map(([rank, up, rev], i): TarotCard => ({
    id: `${suit.id}-${i + 1}`,
    name: `${rank} of ${suit.name}`,
    arcana: 'minor',
    glyph: suit.glyph,
    upright: `${cap1(up)} in the realm of ${suit.theme}.`,
    reversed: `${cap1(rev)} around ${suit.theme}.`,
    reflection: `Where in ${suit.theme} am I experiencing ${up}?`,
    relationship: `In connection, this card points to ${up}, touching ${suit.theme}.`,
    growth: `Growth here comes from working with ${suit.theme} thoughtfully.`,
  })),
);

function cap1(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const TAROT_DECK: readonly TarotCard[] = [...MAJORS, ...MINORS];

export interface SpreadDef {
  id: string;
  name: string;
  description: string;
  positions: { emoji: string; label: string }[];
}

const pos = (emoji: string, label: string): { emoji: string; label: string } => ({ emoji, label });

export const SPREADS: readonly SpreadDef[] = [
  { id: 'one', name: 'One Card', description: 'A single card for a single question or moment.', positions: [pos('🃏', 'Your card')] },
  { id: 'three', name: 'Three Card', description: 'A flexible trio for any question.', positions: [pos('1️⃣', 'First'), pos('2️⃣', 'Second'), pos('3️⃣', 'Third')] },
  { id: 'ppf', name: 'Past / Present / Future', description: 'Where you have been, where you are, where you are heading.', positions: [pos('⏪', 'Past'), pos('⏺️', 'Present'), pos('⏩', 'Future')] },
  { id: 'sca', name: 'Situation / Challenge / Advice', description: 'Understand a situation and a way through.', positions: [pos('🌍', 'Situation'), pos('⚔️', 'Challenge'), pos('💡', 'Advice')] },
  { id: 'self', name: 'Self Reflection', description: 'A gentle look inward.', positions: [pos('🪞', 'How I see myself'), pos('💭', 'What I am feeling'), pos('🌱', 'What I need'), pos('🧭', 'Where to grow')] },
  { id: 'relationship', name: 'Relationship', description: 'Reflect on a connection.', positions: [pos('🙋', 'You'), pos('🤝', 'Them'), pos('🔗', 'The connection'), pos('🌉', 'Strength'), pos('🌧️', 'Challenge'), pos('✨', 'Potential')] },
  { id: 'friendship', name: 'Friendship', description: 'Reflect on a friendship.', positions: [pos('🌟', 'What you bring'), pos('🎁', 'What they bring'), pos('🧩', 'What binds you'), pos('🌱', 'How to nurture it')] },
  { id: 'decision', name: 'Decision', description: 'Weigh two paths.', positions: [pos('❓', 'The question'), pos('🅰️', 'Path A'), pos('🅱️', 'Path B'), pos('⚖️', 'What to weigh'), pos('💡', 'Advice')] },
  { id: 'weekly', name: 'Weekly', description: 'A six-card look at the week.', positions: [pos('🌱', 'Where you are'), pos('🧭', 'What you\'re moving toward'), pos('🪞', 'What needs attention'), pos('❤️', 'Relationships'), pos('✨', 'Advice'), pos('🔮', 'Week ahead')] },
  { id: 'monthly', name: 'Monthly', description: 'A look at each week of the month plus a theme.', positions: [pos('🌙', 'Month\'s theme'), pos('1️⃣', 'Week one'), pos('2️⃣', 'Week two'), pos('3️⃣', 'Week three'), pos('4️⃣', 'Week four'), pos('✨', 'Guidance')] },
];

export interface DrawnCard {
  cardId: string;
  reversed: boolean;
  position: string;
}

/** A shuffled draw. Pass a seed for repeatable draws (the daily card) or omit for fresh randomness. */
export function drawSpread(spread: SpreadDef, seed?: string): DrawnCard[] {
  const next = seed === undefined ? Math.random : rng(hashSeed(seed));
  const deck = [...TAROT_DECK];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return spread.positions.map((p, i) => ({ cardId: deck[i]!.id, reversed: next() < 0.3, position: p.label }));
}

export function cardById(id: string): TarotCard | undefined {
  return TAROT_DECK.find((c) => c.id === id);
}
