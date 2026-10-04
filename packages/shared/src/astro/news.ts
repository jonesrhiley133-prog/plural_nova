export const NEWS_CATEGORIES = [
  { id: 'moon', emoji: '🌙', label: 'Moon Events' },
  { id: 'solar', emoji: '☀️', label: 'Solar Events' },
  { id: 'planets', emoji: '🪐', label: 'Planetary Transits' },
  { id: 'zodiac', emoji: '♈', label: 'Zodiac' },
  { id: 'tarot', emoji: '🔮', label: 'Tarot' },
  { id: 'basics', emoji: '💫', label: 'Astrology Basics' },
  { id: 'reflection', emoji: '🌱', label: 'Self-reflection' },
  { id: 'education', emoji: '📚', label: 'Astrology Education' },
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number]['id'];

export interface Article {
  id: string;
  category: NewsCategory;
  title: string;
  summary: string;
  tradition: string;
  science: string;
}

const a = (id: string, category: NewsCategory, title: string, summary: string, tradition: string, science: string): Article => ({ id, category, title, summary, tradition, science });

export const ARTICLES: readonly Article[] = [
  a('mercury', 'planets', 'What does Mercury represent in astrology?', 'Mercury is the planet of mind and message.',
    'In traditional astrology Mercury governs thinking, learning, speech, writing, travel and everyday exchange. Its sign is said to describe how someone processes and shares information, and Mercury retrograde — when it appears to move backwards in the sky — is a popular shorthand for slowing down, double-checking and revisiting plans.',
    'Mercury is a real planet and retrograde motion is a real optical effect of orbits, but there is no scientific evidence that it affects communication, technology or mood on Earth.'),
  a('full-moon', 'moon', 'What happens during a Full Moon?', 'The Moon is opposite the Sun and fully lit.',
    'Astrologers describe the Full Moon as a time of culmination, clarity and heightened emotion — a moment to notice what has grown and what is ready to be released. Each Full Moon takes on the colour of its zodiac sign.',
    'Astronomically, the Full Moon occurs when the Moon is on the far side of Earth from the Sun. Studies have not found reliable links between lunar phases and behaviour, sleep, or emergencies beyond small, inconsistent effects (such as brighter nights).'),
  a('rising', 'basics', 'Understanding your Rising Sign', 'Your Ascendant is the sign rising on the eastern horizon at birth.',
    'The Rising sign is traditionally seen as your "outer style" — first impressions and how you approach new situations. It also sets the first house and the layout of the whole chart, which is why it needs an accurate birth time and place.',
    'The ascendant is a real geometric point, but there is no scientific support for it shaping personality. It changes about every two hours, which is why birth time matters in astrology.'),
  a('houses', 'basics', 'What are natal houses?', 'Twelve areas of life in a birth chart.',
    'Houses divide the chart into twelve life areas — self, values, communication, home, creativity, routines, partnership, intimacy, belief, career, community and rest. A planet\'s house suggests where its themes are said to play out.',
    'There are several house systems that disagree with each other and none is physically privileged, which is one reason astrology is considered symbolic rather than empirical.'),
  a('venus', 'planets', 'How Venus is interpreted in relationships', 'Venus describes affection, attraction and values.',
    'Traditionally, Venus\'s sign is read as a person\'s style of giving and receiving affection and what they find beautiful. Venus aspects between two charts are a classic focus in compatibility readings.',
    'Research has not shown that Venus placements predict relationship satisfaction. Treat them as conversation prompts about what you value.'),
  a('sun-moon', 'basics', 'Sun, Moon and Rising: the big three', 'Core self, emotional world, outward style.',
    'The Sun sign is said to describe identity and vitality, the Moon sign emotional needs and comfort, and the Rising sign outward approach. Together they are the usual starting point for reading a chart.',
    'Controlled studies (for example, Carlson 1985) have not found that astrologers can match people to their charts better than chance.'),
  a('elements', 'zodiac', 'Elements and modalities', 'Fire, Earth, Air and Water; Cardinal, Fixed and Mutable.',
    'The twelve signs are grouped by four elements (temperament) and three modalities (how they act: initiate, sustain, adapt). Each sign is a unique element-modality pair.',
    'These groupings are a classical organising scheme; they are not supported as reliable personality categories.'),
  a('new-moon', 'moon', 'New Moon rituals for reflection', 'A quiet moment to set intentions.',
    'Many people use the New Moon as a monthly checkpoint to journal, set small intentions, and begin something gently.',
    'There is nothing astronomical that makes this special for intentions, but regular check-ins are a genuinely useful habit.'),
  a('solstice', 'solar', 'Solstices and equinoxes', 'The four turning points of the Sun\'s year.',
    'Astrologers mark the Sun\'s entry into Aries, Cancer, Libra and Capricorn as the start of each season and see these as strong turning points.',
    'The equinoxes and solstices are astronomical events caused by Earth\'s axial tilt; seasonal light changes can influence mood, which is real, but the zodiac sign is only a calendar label.'),
  a('retrograde', 'planets', 'Retrograde planets explained', 'Why planets appear to move backwards.',
    'Retrograde periods are traditionally seen as phases for review: re-do, re-think, re-connect.',
    'Retrogrades are an optical illusion caused by Earth overtaking (or being overtaken by) another planet.'),
  a('tarot-intro', 'tarot', 'Tarot as a reflection tool', 'Cards as prompts, not predictions.',
    'Tarot has 78 cards: 22 Major Arcana for big themes and 56 Minor Arcana for everyday life. Readers use the images and meanings to start a conversation with themselves.',
    'There is no evidence that tarot predicts events. Its value lies in reflection and storytelling.'),
  a('tarot-reverse', 'tarot', 'What do reversed tarot cards mean?', 'Reversed cards soften or invert a theme.',
    'A reversed card is often read as the same theme turned inward, blocked, or in need of attention. Many readers ignore reversals altogether — both are fine.',
    'Reversal rules are a modern convention; the meaning comes from the reader, not from the card.'),
  a('journal', 'reflection', 'Journaling with astrology', 'Compare a prompt with how you actually felt.',
    'Use the daily reading as a gentle prompt, then write how the day truly felt. Over weeks you may notice your own patterns, which may or may not line up with the reading.',
    'The stars do not cause moods; the value is in the self-observation. Seeing where a reading did not fit is just as informative as where it did.'),
  a('birth-time', 'education', 'Why birth time matters', 'Some placements change within hours.',
    'The Moon changes sign every 2–3 days and the Ascendant every ~2 hours, so only a birth time and place can pin them down. Without them, a Sun sign is still reliable.',
    'This is a practical limit of the system, not a mystery: PluralNova never guesses values it cannot calculate.'),
  a('science', 'education', 'Astrology and the evidence', 'What studies have and have not found.',
    'Astrology is a symbolic tradition that has been practised for thousands of years in many cultures.',
    'Well-controlled tests have repeatedly failed to find predictive power. Many people still enjoy it as a language for reflection, culture and storytelling — and that is a fine reason to enjoy it.'),
  a('self-care', 'reflection', 'Using your Moon sign for self-care ideas', 'A gentle way to ask what you need.',
    'The Moon sign is traditionally linked to what soothes you. Water Moons might journal, Earth Moons tidy or cook, Air Moons talk it out, and Fire Moons move.',
    'These are fun starting points; your real needs matter more than your Moon sign.'),
];
