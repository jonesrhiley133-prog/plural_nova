import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Astro } from '@pluralnova/shared';
import { AstroCard, Disclaimer, EnergyBars, KV, NeedsBirthday, Unlock } from '../ui.js';
import { fmtDay, localDay, reader, signLine, type Subject } from '../data.js';
import { ReflectionForm } from './Reflection.js';

export default function Today({ subject, editBirth }: { subject: Subject; editBirth: () => void }): JSX.Element {
  const [day] = useState(() => localDay());
  const p = subject.profile;
  if (p.level === 'none') return <NeedsBirthday name={subject.name} action={editBirth} />;
  const d = Astro.dailyReading(p, reader(subject), day);
  const transit = Astro.sunTransit(day);

  return (
    <>
      <AstroCard className="astro-hero">
        <h2>Today's Astrology for {subject.name}</h2>
        <div className="astro-hero__signs">{signLine(p).map((s) => <span key={s}>{s}</span>)}</div>
        <KV rows={[
          ["Today's Theme", d.theme],
          ['Energy', `${d.energy}%`],
          ['Emotional Focus', d.emotionalFocus],
          ['Relationships', d.relationships],
        ]} />
        {p.unlockPrompt ? <div style={{ marginTop: 12 }}><Unlock>{p.unlockPrompt}</Unlock></div> : null}
      </AstroCard>

      <div className="astro-grid">
        <AstroCard title={`${d.moon.emoji} Current moon phase`}>
          <p><b>{d.moon.phase}</b> in {d.moon.sign} · {Math.round(d.moon.illumination * 100)}% lit</p>
          <p>{d.emotions}</p>
        </AstroCard>
        <AstroCard title="☀️ Sun transit">
          <p>Sun in <b>{transit.current}</b> since {fmtDay(transit.since)}. Next: {transit.next} on {fmtDay(transit.until)}.</p>
        </AstroCard>
        <AstroCard title="⚡ Energy of the day"><EnergyBars energies={d.energies} /></AstroCard>
        <AstroCard title="💫 Major planetary transits">
          <ul className="astro-list">{d.transits.map((t) => <li key={t}>{t}</li>)}</ul>
        </AstroCard>
        {d.personalTransits.length ? (
          <AstroCard title="🎯 Transits to your chart">
            <ul className="astro-list">{d.personalTransits.map((t) => <li key={t.label}><b>{t.label}</b><br />{t.text}</li>)}</ul>
          </AstroCard>
        ) : (
          <AstroCard title="🎯 Personal transits"><Unlock>Exact transits to your own chart unlock with a birth time and UTC offset.</Unlock></AstroCard>
        )}
      </div>

      <div className="astro-grid" style={{ marginTop: 'var(--space-3)' }}>
        <AstroCard title="☀️ Daily horoscope">
          <p><b>Emotions:</b> {d.emotions}</p>
          <p><b>Social:</b> {d.social}</p>
          <p><b>Creativity:</b> {d.creativity}</p>
          <p><b>Productivity:</b> {d.productivity}</p>
          <p><b>Challenges:</b> {d.challenges}</p>
          <p><b>Opportunities:</b> {d.opportunities}</p>
        </AstroCard>
        <AstroCard title="🎯 Focus + 🌱 activity">
          <p><b>Focus:</b> {d.focus}</p>
          <p><b>Suggested activity:</b> {d.activity}</p>
          <p><b>🧠 Reflection prompt:</b> {d.prompt}</p>
          <p><b>✨ Cosmic message:</b> {d.cosmicMessage}</p>
        </AstroCard>
      </div>

      <AstroCard title="📓 Astrology Journal — how did today actually feel?">
        <p>Today's astrology suggested reflection. How did you actually feel? <Link to="/journal">Open the Journal</Link></p>
        <ReflectionForm subject={subject} reading={d} />
      </AstroCard>
      <Disclaimer />
    </>
  );
}
