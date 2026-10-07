import { useMemo, useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { AstroCard, Disclaimer } from '../ui.js';
import { fmtDay, localDay, type Subject } from '../data.js';

export default function SolarCalendar({ subject }: { subject: Subject }): JSX.Element {
  const [year, setYear] = useState(() => localDay().getUTCFullYear());
  const today = localDay();
  const t = useMemo(() => Astro.sunTransit(today), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ingresses = useMemo(() => Astro.ingressesBetween('sun', new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 11, 31, 23))), [year]);
  const p = subject.profile;
  const base = p.rising ?? p.sun;
  const house = base ? ((Astro.SIGN_NAMES.indexOf(t.current) - Astro.SIGN_NAMES.indexOf(base) + 12) % 12) + 1 : null;
  const rel = p.sun ? Astro.signRelation(t.current, p.sun) : null;
  const info = Astro.signInfo(t.current);

  return (
    <>
      <div className="astro-grid">
        <AstroCard title={`${info.glyph} Sun in ${t.current}`}>
          <p><b>Previous:</b> {Astro.signInfo(t.previous).glyph} {t.previous} · <b>Next:</b> {Astro.signInfo(t.next).glyph} {t.next}</p>
          <p><b>Entered:</b> {fmtDay(t.since)} · <b>Moves on:</b> {fmtDay(t.until)}</p>
          <p>{Astro.sunIngressMeaning(t.current)}</p>
        </AstroCard>
        <AstroCard title={`How it meets ${subject.name}'s chart`}>
          {rel && p.sun ? <p>The Sun in {t.current} is in a {rel.name} to their {p.sun} Sun — traditionally {rel.tone}.</p> : <p>Add a birthday to see this.</p>}
          {house ? <p>It falls in house {house} {p.rising ? 'from their Rising sign' : 'counting from their Sun sign'}: {Astro.HOUSES[house - 1]!.theme}.</p> : null}
          {!p.rising ? <p className="astro-note">Add birth time and birthplace for houses counted from the Rising sign.</p> : null}
        </AstroCard>
      </div>
      <AstroCard title={`☀️ Solar calendar ${year}`}>
        <div className="astro-chips" style={{ marginBottom: 12 }}>
          <button onClick={() => setYear(year - 1)}>← {year - 1}</button>
          <button onClick={() => setYear(year + 1)}>{year + 1} →</button>
        </div>
        <ul className="astro-list">
          {ingresses.map((i) => (
            <li key={i.date.getTime()}>
              <b>{Astro.signInfo(i.sign).glyph} {fmtDay(i.date)}</b> — Sun enters {i.sign} ({Astro.signInfo(i.sign).element}, {Astro.signInfo(i.sign).modality})
              {Astro.signInfo(i.sign).modality === 'Cardinal' ? ' · season change' : ''}
            </li>
          ))}
        </ul>
      </AstroCard>
      <Disclaimer />
    </>
  );
}
