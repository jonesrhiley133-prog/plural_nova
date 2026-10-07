import { useMemo, useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { AstroCard, Disclaimer, NeedsBirthday } from '../ui.js';
import { fmtDay, localDay, reader, type Subject } from '../data.js';

const RANGES = ['daily', 'tomorrow', 'weekly', 'monthly', 'yearly'] as const;
type Range = (typeof RANGES)[number];

function Day({ d, title }: { d: Astro.DailyReading; title: string }): JSX.Element {
  return (
    <AstroCard title={title}>
      <p><b>Overall energy:</b> {d.energy}% — {d.theme}</p>
      <p><b>Emotions:</b> {d.emotions}</p>
      <p><b>Relationships:</b> {d.relationships}</p>
      <p><b>Social energy:</b> {d.social}</p>
      <p><b>Creativity:</b> {d.creativity}</p>
      <p><b>Productivity:</b> {d.productivity}</p>
      <p><b>Challenges:</b> {d.challenges}</p>
      <p><b>Opportunities:</b> {d.opportunities}</p>
      <p><b>Reflection prompt:</b> {d.prompt}</p>
    </AstroCard>
  );
}

export default function Horoscope({ subject, editBirth }: { subject: Subject; editBirth: () => void }): JSX.Element {
  const [range, setRange] = useState<Range>('daily');
  const [today] = useState(() => localDay());
  const p = subject.profile;
  const r = reader(subject);
  const view = useMemo(() => {
    if (p.level === 'none') return null;
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth() + 1;
    switch (range) {
      case 'daily': return { kind: 'day' as const, d: Astro.dailyReading(p, r, today) };
      case 'tomorrow': return { kind: 'day' as const, d: Astro.dailyReading(p, r, localDay(1)) };
      case 'weekly': return { kind: 'week' as const, w: Astro.weeklyReading(p, r, today) };
      case 'monthly': return { kind: 'month' as const, m: Astro.monthlyReading(p, r, y, m) };
      case 'yearly': return { kind: 'year' as const, y: Astro.yearlyReading(p, r, y) };
    }
  }, [range, p, r.id, today]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!view) return <NeedsBirthday name={subject.name} action={editBirth} />;

  return (
    <>
      <div className="astro-chips" role="group" aria-label="Timeframe" style={{ marginBottom: 'var(--space-3)' }}>
        {RANGES.map((x) => <button key={x} aria-pressed={range === x} onClick={() => setRange(x)}>{x[0]!.toUpperCase() + x.slice(1)}</button>)}
      </div>

      {view.kind === 'day' ? <Day d={view.d} title={`${range === 'daily' ? "Today's" : "Tomorrow's"} horoscope for ${subject.name} — ${fmtDay(view.d.date, { weekday: 'long', month: 'long', day: 'numeric' })}`} /> : null}

      {view.kind === 'week' ? (
        <>
          <AstroCard title={`Week of ${fmtDay(view.w.start)} — Monday to Sunday`}>
            <ul className="astro-list">
              {view.w.days.map((d) => (
                <li key={d.date}>{d.important ? '⭐ ' : ''}<b>{d.weekday}</b> · {d.emoji} {d.moon} · {d.theme} · energy {d.energy}%</li>
              ))}
            </ul>
          </AstroCard>
          <div className="astro-grid">
            <AstroCard title="Emotional themes"><p>{view.w.emotional}</p></AstroCard>
            <AstroCard title="Relationship themes"><p>{view.w.relationships}</p></AstroCard>
            <AstroCard title="Major astrological events">
              <ul className="astro-list">{view.w.events.length ? view.w.events.map((e, i) => <li key={i}>{e.icon} <b>{fmtDay(e.date)}</b> — {e.title}</li>) : <li>A quiet week, sky-wise.</li>}</ul>
            </AstroCard>
            <AstroCard title="Important days">
              <ul className="astro-list">{view.w.important.length ? view.w.important.map((t) => <li key={t}>{t}</li>) : <li>No major lunar or solar markers this week.</li>}</ul>
            </AstroCard>
          </div>
        </>
      ) : null}

      {view.kind === 'month' ? (
        <>
          <AstroCard title={`${view.m.month} — monthly theme`}><p>{view.m.theme}</p></AstroCard>
          <div className="astro-grid">
            <AstroCard title="Relationships"><p>{view.m.relationships}</p></AstroCard>
            <AstroCard title="Creativity"><p>{view.m.creativity}</p></AstroCard>
            <AstroCard title="School / work"><p>{view.m.schoolWork}</p></AstroCard>
            <AstroCard title="Personal growth"><p>{view.m.growth}</p></AstroCard>
            <AstroCard title="Major transits"><ul className="astro-list">{view.m.transits.map((e, i) => <li key={i}>{e.icon} <b>{fmtDay(e.date)}</b> — {e.title}</li>)}</ul></AstroCard>
            <AstroCard title="Moon phases"><ul className="astro-list">{view.m.moonPhases.map((e, i) => <li key={i}>{e.icon} <b>{fmtDay(e.date)}</b> — {e.title}</li>)}</ul></AstroCard>
            <AstroCard title="Important dates"><ul className="astro-list">{view.m.importantDates.map((e, i) => <li key={i}><b>{fmtDay(e.date)}</b> — {e.title}</li>)}</ul></AstroCard>
          </div>
        </>
      ) : null}

      {view.kind === 'year' ? (
        <>
          <AstroCard title={`${view.y.year} — major themes`}><ul className="astro-list">{view.y.themes.map((t) => <li key={t}>{t}</li>)}</ul></AstroCard>
          <div className="astro-grid">
            <AstroCard title="Significant transits"><ul className="astro-list">{view.y.slowTransits.map((t) => <li key={t.planet}>{t.text}</li>)}</ul></AstroCard>
            <AstroCard title="Relationship themes"><p>{view.y.relationships}</p></AstroCard>
            <AstroCard title="🌱 Growth periods"><ul className="astro-list">{view.y.growthPeriods.map((g) => <li key={g.sign}><b>{g.sign} season</b> · {g.range}</li>)}</ul></AstroCard>
            <AstroCard title="🪞 Reflection periods"><ul className="astro-list">{view.y.reflectionPeriods.map((g) => <li key={g.sign}><b>{g.sign} season</b> · {g.range}</li>)}</ul></AstroCard>
          </div>
          <AstroCard title="Major astrological events">
            <ul className="astro-list">{view.y.events.map((e, i) => <li key={i}>{e.icon} <b>{fmtDay(e.date)}</b> — {e.title}</li>)}</ul>
          </AstroCard>
        </>
      ) : null}
      <Disclaimer />
    </>
  );
}
