import type { PlanetId } from './ephemeris.js';
import { PLANET_IDS } from './ephemeris.js';
import type { AstroProfile } from './chart.js';
import { dailyReading, type ReaderKey } from './horoscope.js';
import { interpretPlacement } from './interpret.js';
import { PLANETS, SIGNS, signInfo } from './signs.js';
import { cap } from './sky.js';
import { compare } from './compat.js';
import { ARTICLES } from './news.js';

export interface ChatContext {
  name: string;
  profile: AstroProfile;
  reader: ReaderKey;
  today: Date;
  /** Other alters' charts, for "compare my chart with …". */
  others: { name: string; profile: AstroProfile }[];
}

const FOOTER = '\n\n_Astrology-inspired reflection, not a prediction or scientific fact._';

/**
 * A built-in, rule-based astrology guide. It answers from the stored chart and
 * the educational library, so nobody has to re-explain their chart, and it
 * needs no external AI service or key.
 */
export function astroReply(question: string, ctx: ChatContext): string {
  const q = question.toLowerCase();
  const { profile, name } = ctx;

  // "Venus in Libra"
  const planetWord = PLANETS.find((p) => new RegExp(`\\b${p.name.toLowerCase()}\\b`).test(q));
  const signWord = SIGNS.find((s) => new RegExp(`\\b${s.name.toLowerCase()}\\b`).test(q));
  if (planetWord && signWord && /\bin\b|mean/.test(q)) {
    const reading = interpretPlacement(planetWord.id, signWord.name, null);
    return `**${reading.title}**\n\n${reading.represents}\n\n${reading.inSign}\n\n${reading.topics.slice(0, 4).map((t) => `• ${t.text}`).join('\n')}${FOOTER}`;
  }

  if (/compare|compatib|synastry/.test(q)) {
    const target = ctx.others.find((o) => q.includes(o.name.toLowerCase()));
    if (!target) return `Tell me who to compare with — for example "Compare my chart with ${ctx.others[0]?.name ?? 'Bonnie'}'s".${ctx.others.length ? ` I can see: ${ctx.others.map((o) => o.name).join(', ')}.` : ' No other alters have visible astrology yet.'}`;
    const result = compare(profile, target.profile, { me: name, other: target.name });
    if (!result) return `I need a birthday for both ${name} and ${target.name} first.`;
    return `**${name} ↔ ${target.name}: ${result.headline}**\n\n${result.summary}\n\n${result.categories.map((c) => `${c.emoji} ${c.name} — ${c.flow}`).join('\n')}${FOOTER}`;
  }

  if (/rising|ascendant/.test(q) && !profile.rising) {
    return profile.unlockPrompt ?? `I cannot calculate a Rising sign for ${name} yet.`;
  }

  if (/(explain|tell).*(chart|birth)|^birth chart|my chart/.test(q)) {
    if (!profile.sun) return 'Add a birthday to unlock your Sun sign and zodiac profile.';
    const lines = [`**${name}'s chart**`, `☀️ Sun in ${profile.sun} (${profile.element}, ${profile.modality})`];
    if (profile.moon) lines.push(`🌙 Moon in ${profile.moon}`);
    if (profile.rising) lines.push(`⬆️ ${profile.rising} Rising`);
    const known = profile.placements.filter((p) => p.sign && !['sun', 'moon'].includes(p.id));
    if (known.length) lines.push('', ...known.map((p) => `• ${cap(p.id)} in ${p.sign}${p.house ? ` (house ${p.house})` : ''}`));
    if (profile.unlockPrompt) lines.push('', profile.unlockPrompt);
    return `${lines.join('\n')}${FOOTER}`;
  }

  const planetAsked = PLANETS.find((p) => q.includes(p.name.toLowerCase()));
  if (planetAsked) {
    const own = profile.placements.find((p) => p.id === planetAsked.id);
    if (own?.sign) {
      const r = interpretPlacement(planetAsked.id, own.sign, own.house, own.retrograde);
      return `**${name}'s ${r.title}**\n\n${r.represents}\n\n${r.inSign}${r.houseText ? `\n\n${r.houseText}` : ''}${FOOTER}`;
    }
    if (planetAsked.id === 'moon' || planetAsked.id === 'mercury' || planetAsked.id === 'venus' || planetAsked.id === 'mars') {
      return `${planetAsked.name} represents ${planetAsked.represents}. I can't state ${name}'s ${planetAsked.name} sign without a birth time — add birth time and birthplace to unlock it.`;
    }
    return `${planetAsked.name} represents ${planetAsked.represents}.${FOOTER}`;
  }

  if (/moon sign|my moon/.test(q)) {
    return profile.moon ? `${name}'s Moon is in ${profile.moon}. ${interpretPlacement('moon', profile.moon, null).inSign}${FOOTER}` : 'I need a birth time to say which sign your Moon was in — it changes every couple of days.';
  }

  const signAsked = SIGNS.find((s) => q.includes(s.name.toLowerCase()));
  if (signAsked) {
    return `**${signAsked.glyph} ${signAsked.name}** (${signAsked.dates}, ${signAsked.element}, ${signAsked.modality})\n\n${signAsked.summary}\nRuler: ${signAsked.ruler}.${FOOTER}`;
  }

  if (/today|reading|reflect|horoscope|energy/.test(q)) {
    const d = dailyReading(profile, ctx.reader, ctx.today);
    return `**A reflective reading for ${name}**\n\n${d.moon.emoji} ${d.moon.phase} in ${d.moon.sign}\n**Theme:** ${d.theme}\n**Energy:** ${d.energy}%\n\n${d.emotions}\n\n🧠 ${d.prompt}${FOOTER}`;
  }

  const article = ARTICLES.find((x) => x.title.toLowerCase().split(' ').filter((w) => w.length > 4).some((w) => q.includes(w)));
  if (article) return `**${article.title}**\n\n${article.tradition}\n\n_What science says:_ ${article.science}`;

  return `I can explain your chart, a placement like "Venus in Libra", compare you with another alter, or give a reflective reading for today. I use ${name}'s saved birth info${profile.sun ? `, a ${profile.sun} Sun` : ''}.${FOOTER}`;
}

export { PLANET_IDS, signInfo };
export type { PlanetId };
