import { useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { AstroCard, Disclaimer, NeedsBirthday, Unlock } from '../ui.js';
import { fmtDay, type Subject } from '../data.js';
import { ChartWheel } from './ChartWheel.js';


export default function Chart({ subject, editBirth }: { subject: Subject; editBirth: () => void }): JSX.Element {
  const p = subject.profile;
  const [sel, setSel] = useState<Astro.PlanetId | null>('sun');
  if (p.level === 'none') return <NeedsBirthday name={subject.name} action={editBirth} />;

  const info = p.sun ? Astro.signInfo(p.sun) : null;
  const placement = p.placements.find((x) => x.id === sel);
  const reading = placement?.sign ? Astro.interpretPlacement(placement.id, placement.sign, placement.house, placement.retrograde) : null;
  const birth = Astro.parseBirthday(String(subject.member['birthday'] ?? ''));
  const birthMoon = birth ? Astro.moonState(new Date(Date.UTC(birth.y, birth.m - 1, birth.d, 12))) : null;
  const total = Object.values(p.elementCounts).reduce((a, b) => a + b, 0) || 1;

  return (
    <>
      {p.unlockPrompt ? (
        <Unlock>{p.unlockPrompt} <button className="astro-pill" onClick={editBirth}>Add birth details</button></Unlock>
      ) : null}

      {info ? (
        <AstroCard title={`${info.glyph} ${info.name} — ${info.dates}`}>
          <p>{info.summary}</p>
          <p><b>Element:</b> {Astro.ELEMENT_EMOJI[info.element]} {info.element} · <b>Modality:</b> {info.modality} · <b>Ruler:</b> {info.ruler}</p>
          <p><b>Keywords:</b> {info.keywords.join(', ')}</p>
        </AstroCard>
      ) : null}

      {p.level !== 'basic' ? (
        <div className="astro-grid">
          <AstroCard title="🪐 Interactive birth chart">
            <ChartWheel profile={p} selected={sel} onSelect={setSel} />
            <p className="astro-note">Tap a planet. {p.level === 'planets' ? 'Without a birthplace the wheel starts at 0° Aries and has no houses.' : 'Equal houses from the Ascendant. Positions are approximate.'}</p>
          </AstroCard>
          <AstroCard title={reading ? `${Astro.planetInfo(placement!.id).glyph} ${reading.title}` : 'Select a planet'}>
            {reading ? (
              <>
                <p><b>Planet → Sign → House → Meaning</b></p>
                <p>{reading.represents}</p>
                <p>{reading.inSign}</p>
                {reading.houseText ? <p>{reading.houseText}</p> : <p className="astro-note">House needs birthplace.</p>}
                {reading.note ? <p>{reading.note}</p> : null}
                {placement!.degree !== null ? <p className="astro-note">{placement!.degree!.toFixed(1)}° {placement!.sign}{placement!.id === 'chiron' ? ' (Chiron is approximate)' : ''}</p> : null}
              </>
            ) : <p>Tap a planet on the wheel to see its meaning.</p>}
          </AstroCard>
        </div>
      ) : null}

      <AstroCard title="Chart overview">
        <ul className="astro-list">
          {p.placements.map((x) => {
            const i = Astro.planetInfo(x.id);
            return (
              <li key={x.id}>
                <button className="astro-pill" onClick={() => setSel(x.id)} disabled={!x.sign}>{i.glyph} {i.name}</button>{' '}
                {x.sign ? <><b>{x.sign}</b>{x.house ? ` · house ${x.house}` : ''}{x.retrograde ? ' · ℞' : ''}</> : <span>Needs birth time to state a sign</span>}
              </li>
            );
          })}
          {p.rising ? <li><b>⬆️ Rising:</b> {p.rising}</li> : <li><b>⬆️ Rising:</b> <span>needs birth time + birthplace</span></li>}
        </ul>
      </AstroCard>

      <div className="astro-grid">
        <AstroCard title="🏠 Houses">
          {p.houseCusps.length ? (
            <ul className="astro-list">{p.houseCusps.map((h) => <li key={h.house}><b>{Astro.HOUSES[h.house - 1]!.name}</b> in {h.sign} — {Astro.HOUSES[h.house - 1]!.theme}</li>)}</ul>
          ) : <Unlock>Full houses unlock with birth time and birthplace.</Unlock>}
        </AstroCard>
        <AstroCard title="✨ Major aspects">
          {p.aspects.length ? (
            <ul className="astro-list">{p.aspects.slice(0, 14).map((a, i) => <li key={i}><b>{Astro.cap(a.a)} {a.aspect.glyph} {Astro.cap(a.b)}</b> — {a.aspect.label}, {a.orb.toFixed(1)}° ({a.aspect.tone})</li>)}</ul>
          ) : <Unlock>Aspects unlock with an exact birth time and UTC offset.</Unlock>}
        </AstroCard>
        <AstroCard title="🌌 Element & modality">
          <ul className="astro-list">
            {(Object.keys(p.elementCounts) as Astro.Element[]).map((e) => <li key={e}>{Astro.ELEMENT_EMOJI[e]} {e}: {p.elementCounts[e]} <span>({Math.round((p.elementCounts[e] / total) * 100)}%)</span></li>)}
            {(Object.keys(p.modalityCounts) as Astro.Modality[]).map((e) => <li key={e}>{e}: {p.modalityCounts[e]}</li>)}
          </ul>
        </AstroCard>
        {birthMoon ? (
          <AstroCard title="🌙 Lunar information">
            <p>Born under a {birthMoon.phase.emoji} <b>{birthMoon.phase.name}</b> ({Math.round(birthMoon.illumination * 100)}% lit){p.moon ? <> with the Moon in {p.moon}</> : null}.</p>
            <p className="astro-note">Phase shown for midday UTC on {fmtDay(String(subject.member['birthday']), { month: 'long', day: 'numeric', year: 'numeric' })}.</p>
          </AstroCard>
        ) : null}
      </div>

      {reading ? (
        <AstroCard title={`Detailed interpretation — ${reading.title}`}>
          <ul className="astro-list">
            {reading.topics.map((t) => <li key={t.topic}><b>{Astro.TOPIC_LABELS[t.topic]}.</b> {t.text}</li>)}
          </ul>
        </AstroCard>
      ) : null}
      <Disclaimer />
    </>
  );
}
