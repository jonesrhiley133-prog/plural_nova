import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Astro } from '@pluralnova/shared';
import { useCollection } from '../../../core/data.js';
import { AstroCard, Disclaimer } from '../ui.js';
import { fmtDay, localDay, type Subject } from '../data.js';

interface Item { date: string; icon: string; title: string; kind: string }

export default function AstroCalendar({ subject, subjects }: { subject: Subject; subjects: Subject[] }): JSX.Element {
  const [anchor, setAnchor] = useState(() => localDay());
  const [selected, setSelected] = useState<string | null>(null);
  const tarot = useCollection('tarotReadings', { filter: (r) => r['memberId'] === subject.id });
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth();

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const start = new Date(Date.UTC(y, m, 1));
    const end = new Date(Date.UTC(y, m + 1, 1));
    for (const e of Astro.skyEventsBetween(start, end)) out.push({ date: Astro.dateKey(e.date), icon: e.icon, title: e.title, kind: e.kind });
    for (const s of subjects) {
      const b = Astro.parseBirthday(String(s.member['birthday'] ?? ''));
      if (b && b.m === m + 1 && s.profile.sun) out.push({ date: Astro.dateKey(new Date(Date.UTC(y, m, b.d, 12))), icon: '🎂', title: `${s.name}'s birthday · ${Astro.signInfo(s.profile.sun).glyph} ${s.profile.sun}`, kind: 'birthday' });
    }
    for (const t of tarot.items) {
      const d = String(t['drawnAt']).slice(0, 10);
      if (d.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)) out.push({ date: d, icon: '🃏', title: `${String(t['spreadName'])} reading`, kind: 'tarot' });
    }
    // Personalised: days the Moon is in this alter's Sun sign.
    if (subject.profile.sun) {
      const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      for (let day = 1; day <= count; day += 1) {
        const dt = new Date(Date.UTC(y, m, day, 12));
        const prev = Astro.moonState(new Date(dt.getTime() - 86_400_000)).sign;
        const sign = Astro.moonState(dt).sign;
        if (sign === subject.profile.sun && prev !== sign) out.push({ date: Astro.dateKey(dt), icon: '⭐', title: `Moon enters ${subject.name}'s Sun sign (${sign})`, kind: 'personal' });
      }
    }
    return out;
  }, [y, m, subjects, tarot.items, subject]);

  const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const byDate = (d: string): Item[] => items.filter((i) => i.date === d);
  const key = (day: number): string => Astro.dateKey(new Date(Date.UTC(y, m, day, 12)));
  const shift = (n: number): void => setAnchor(new Date(Date.UTC(y, m + n, 1, 12)));
  const shown = selected ? byDate(selected) : [...items].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <AstroCard title={`📅 Astrology calendar — ${anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`}>
        <div className="astro-chips" style={{ marginBottom: 12 }}>
          <button onClick={() => shift(-1)}>← Prev</button><button onClick={() => { setAnchor(localDay()); setSelected(null); }}>Today</button><button onClick={() => shift(1)}>Next →</button>
          <Link to="/calendar" className="astro-pill">Open PluralNova Calendar</Link>
        </div>
        <div className="astro-cal">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div className="astro-cal__head" key={d}>{d}</div>)}
          {Array.from({ length: lead }, (_, i) => <button key={`b${i}`} className="astro-cal__blank" tabIndex={-1} aria-hidden />)}
          {Array.from({ length: count }, (_, i) => {
            const k = key(i + 1);
            const here = byDate(k);
            return (
              <button key={k} aria-pressed={selected === k} onClick={() => setSelected(selected === k ? null : k)} aria-label={`${fmtDay(k)}: ${here.length} events`}>
                <b>{i + 1}</b><span>{here[0]?.icon ?? Astro.moonState(new Date(`${k}T12:00:00Z`)).phase.emoji}</span>
              </button>
            );
          })}
        </div>
      </AstroCard>
      <AstroCard title={selected ? fmtDay(selected, { month: 'long', day: 'numeric', year: 'numeric' }) : 'This month'}>
        <ul className="astro-list">{shown.length ? shown.map((i, n) => <li key={n}>{i.icon} <b>{fmtDay(i.date)}</b> — {i.title}</li>) : <li>Nothing marked.</li>}</ul>
      </AstroCard>
      <Disclaimer />
    </>
  );
}
