import { useMemo, useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { AstroCard, Disclaimer } from '../ui.js';
import { fmtDay, localDay, type Subject } from '../data.js';

const PHASE_MEANING: Record<string, string> = {
  new: 'Traditionally a time for beginnings, quiet intentions and planting seeds.',
  waxingCrescent: 'Traditionally about taking early steps and building momentum.',
  firstQuarter: 'Traditionally a point of decisions, action and meeting resistance.',
  waxingGibbous: 'Traditionally about refining, adjusting and preparing.',
  full: 'Traditionally a peak of culmination, clarity and release.',
  waningGibbous: 'Traditionally about gratitude, sharing and integrating.',
  thirdQuarter: 'Traditionally about letting go and reassessing.',
  waningCrescent: 'Traditionally about rest, surrender and clearing space.',
};
const REFLECT: Record<string, string> = {
  new: 'What would I like to begin gently?', waxingCrescent: 'What small step can I take?', firstQuarter: 'What decision am I avoiding?',
  waxingGibbous: 'What needs fine-tuning?', full: 'What is fully visible now, and what can I release?', waningGibbous: 'What am I grateful for?',
  thirdQuarter: 'What is ready to be let go?', waningCrescent: 'How can I rest?',
};

function personal(subject: Subject, sign: Astro.SignName): string {
  const p = subject.profile;
  const el = Astro.signInfo(sign).element;
  if (!p.sun) return 'Add a birthday for a personalised note.';
  const rel = Astro.signRelation(sign, p.sun);
  const base = `The Moon in ${sign} sits in a ${rel.name} to ${subject.name}'s ${p.sun} Sun — traditionally ${rel.tone}.`;
  const same = p.moon === sign ? ' It is also passing through their natal Moon sign, which can feel emotionally familiar.' : '';
  return `${base}${same} ${el} Moon days tend to favour ${el === 'Fire' ? 'action and expression' : el === 'Earth' ? 'practical, grounded things' : el === 'Air' ? 'conversation and ideas' : 'feeling and intuition'}.`;
}

export default function MoonCalendar({ subject }: { subject: Subject }): JSX.Element {
  const [anchor, setAnchor] = useState(() => localDay());
  const [selected, setSelected] = useState(() => localDay());
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();

  const { days, events, lead } = useMemo(() => {
    const first = new Date(Date.UTC(y, m, 1, 12));
    const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const evts = Astro.moonEventsBetween(new Date(Date.UTC(y, m, 1)), new Date(Date.UTC(y, m + 1, 1)));
    return {
      lead: (first.getUTCDay() + 6) % 7,
      events: evts,
      days: Array.from({ length: count }, (_, i) => {
        const date = new Date(Date.UTC(y, m, i + 1, 12));
        return { date, moon: Astro.moonState(date), major: evts.find((e) => Astro.dateKey(e.date) === Astro.dateKey(date)) };
      }),
    };
  }, [y, m]);

  const sel = Astro.moonState(selected);
  const selEvent = days.find((d) => Astro.dateKey(d.date) === Astro.dateKey(selected))?.major;
  const todayKey = Astro.dateKey(localDay());
  const shift = (n: number): void => setAnchor(new Date(Date.UTC(y, m + n, 1, 12)));

  return (
    <>
      <AstroCard title={`🌙 ${anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`}>
        <div className="astro-chips" style={{ marginBottom: 12 }}>
          <button onClick={() => shift(-1)} aria-label="Previous month">← Prev</button>
          <button onClick={() => { setAnchor(localDay()); setSelected(localDay()); }}>Today</button>
          <button onClick={() => shift(1)} aria-label="Next month">Next →</button>
        </div>
        <div className="astro-cal" role="grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div className="astro-cal__head" key={d}>{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <button key={`b${i}`} className="astro-cal__blank" tabIndex={-1} aria-hidden />)}
          {days.map((d) => (
            <button
              key={d.date.getTime()}
              className={`${Astro.dateKey(d.date) === todayKey ? 'is-today' : ''} ${d.major ? 'is-major' : ''}`}
              aria-pressed={Astro.dateKey(d.date) === Astro.dateKey(selected)}
              aria-label={`${fmtDay(d.date)}: ${d.moon.phase.name} in ${d.moon.sign}`}
              onClick={() => setSelected(d.date)}
            >
              <b>{d.date.getUTCDate()}</b><span>{d.moon.phase.emoji}</span>
            </button>
          ))}
        </div>
      </AstroCard>

      <AstroCard title={fmtDay(selected, { month: 'long', day: 'numeric', year: 'numeric' })}>
        <p><b>{sel.phase.emoji} {selEvent ? selEvent.name : sel.phase.name} in {sel.sign}</b> · {Math.round(sel.illumination * 100)}% lit</p>
        {selEvent ? <p>Exact {selEvent.name}: {selEvent.date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p> : null}
        <p><b>Theme:</b> {PHASE_MEANING[sel.phase.id]} Coloured by {sel.sign}'s {Astro.signInfo(sel.sign).keywords[0]} tone.</p>
        <p><b>For {subject.name}:</b> {personal(subject, sel.sign)}</p>
        <p><b>Suggested reflection:</b> {REFLECT[sel.phase.id]}</p>
        <p><b>Energy:</b> {sel.illumination > 0.6 ? 'Brighter, more outward' : sel.illumination < 0.25 ? 'Quieter, more inward' : 'Steady, in-between'}.</p>
      </AstroCard>

      <AstroCard title="Principal phases this month">
        <ul className="astro-list">
          {events.map((e) => (
            <li key={e.date.getTime()}>
              <b>{e.emoji} {e.name} in {e.sign}</b> — {fmtDay(e.date)} ({e.date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })})<br />
              {Astro.moonMeaning(e)}<br />
              <i>For {subject.name}:</i> {personal(subject, e.sign)}<br />
              <i>Reflect:</i> {REFLECT[e.phase === 'firstQuarter' ? 'firstQuarter' : e.phase === 'thirdQuarter' ? 'thirdQuarter' : e.phase]}
            </li>
          ))}
        </ul>
      </AstroCard>

      <AstroCard title="The eight phases">
        <ul className="astro-list">{Astro.PHASES.map((ph) => <li key={ph.id}>{ph.emoji} <b>{ph.name}</b> — {PHASE_MEANING[ph.id]}</li>)}</ul>
      </AstroCard>
      <Disclaimer />
    </>
  );
}
