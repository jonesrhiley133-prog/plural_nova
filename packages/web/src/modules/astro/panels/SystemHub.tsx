import { useNavigate } from 'react-router-dom';
import { Astro } from '@pluralnova/shared';
import { AstroCard, Disclaimer } from '../ui.js';
import { fmtDay, localDay, type Subject } from '../data.js';

export default function SystemHub({ subjects, fronting, hiddenCount, select }: { subjects: Subject[]; fronting: Subject[]; hiddenCount: number; select: (id: string) => void }): JSX.Element {
  const navigate = useNavigate();
  const today = localDay();
  const sky = Astro.skyAt(today);
  const known = subjects.filter((s) => s.profile.sun);
  const tally = (get: (p: Astro.AstroProfile) => string | null): [string, number][] => {
    const m = new Map<string, number>();
    for (const s of known) { const v = get(s.profile); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const elements = tally((p) => p.element);
  const modalities = tally((p) => p.modality);
  const events = Astro.skyEventsBetween(today, new Date(today.getTime() + 30 * 86_400_000)).slice(0, 8);
  const topEl = (elements[0]?.[0] ?? 'Water') as Astro.Element;
  const birthdays = known.map((s) => ({ s, b: Astro.parseBirthday(String(s.member['birthday'] ?? '')) })).filter((x) => x.b)
    .map((x) => { const next = new Date(Date.UTC(today.getUTCFullYear(), x.b!.m - 1, x.b!.d, 12)); if (next < today) next.setUTCFullYear(next.getUTCFullYear() + 1); return { ...x, next }; })
    .sort((a, b) => a.next.getTime() - b.next.getTime());
  const d = known[0] ? Astro.dailyReading(known[0].profile, { id: 'system' }, today) : null;

  return (
    <>
      {fronting.map((f) => {
        const t = Astro.dailyReading(f.profile, { id: f.id }, today);
        return (
          <AstroCard key={f.id} title={`Currently Fronting: ${f.name}`}>
            <p>{Astro.signInfo(f.profile.sun!).glyph} {f.profile.sun}{f.profile.moon ? ` · 🌙 Moon in ${f.profile.moon}` : ''}</p>
            <p>✨ Today's theme: {t.theme}</p>
          </AstroCard>
        );
      })}
      <AstroCard title="🌌 Zodiac constellation">
        {known.length ? (
          <div className="astro-constellation">
            <svg viewBox="0 0 100 62" preserveAspectRatio="none" aria-hidden>
              {known.map((s, i) => {
                const [x, y] = pos(s.profile.sun!, i, known);
                const prev = known[i - 1];
                if (!prev) return null;
                const [px, py] = pos(prev.profile.sun!, i - 1, known);
                return <line key={s.id} x1={px} y1={py * 0.62} x2={x} y2={y * 0.62} stroke="rgb(255 255 255 / .25)" strokeWidth=".3" />;
              })}
            </svg>
            {known.map((s, i) => {
              const [x, y] = pos(s.profile.sun!, i, known);
              return (
                <button key={s.id} style={{ left: `${x}%`, top: `${y}%`, borderColor: s.color }} onClick={() => { select(s.id); navigate(`/astro/today?alter=${s.id}`); }} aria-label={`${s.name}, ${s.profile.sun}. Open astrology profile`}>
                  <span>{Astro.signInfo(s.profile.sun!).glyph}</span>{s.name}
                </button>
              );
            })}
          </div>
        ) : <p>No alters with a birthday yet. Add birthdays to see the constellation.</p>}
        {hiddenCount ? <p className="astro-note">{hiddenCount} alter{hiddenCount > 1 ? 's keep' : ' keeps'} their astrology private.</p> : null}
      </AstroCard>

      <div className="astro-grid">
        <AstroCard title="Signs across the system">
          <ul className="astro-list">
            {known.map((s) => <li key={s.id}><b>{s.name}</b> — {Astro.signInfo(s.profile.sun!).glyph} {s.profile.sun}{s.profile.moon ? ` · 🌙 ${s.profile.moon}` : ''}{s.profile.rising ? ` · ⬆️ ${s.profile.rising}` : ''}</li>)}
          </ul>
        </AstroCard>
        <AstroCard title="Elements & modalities">
          <ul className="astro-list">
            {elements.map(([k, n]) => <li key={k}>{Astro.ELEMENT_EMOJI[k as Astro.Element]} {k}: {n}</li>)}
            {modalities.map(([k, n]) => <li key={k}>{k}: {n}</li>)}
          </ul>
          {elements[0] ? <p>Most common element: <b>{elements[0][0]}</b>. Most common modality: <b>{modalities[0]?.[0]}</b>.</p> : null}
        </AstroCard>
        <AstroCard title="🎂 Birthdays">
          <ul className="astro-list">{birthdays.map(({ s, next }) => <li key={s.id}><b>{s.name}</b> — {fmtDay(next)} · {Astro.signInfo(s.profile.sun!).glyph} {s.profile.sun}</li>)}</ul>
        </AstroCard>
        <AstroCard title={`${sky.moon.phase.emoji} Current moon & upcoming events`}>
          <p>{sky.moon.phase.name} in {sky.moon.sign}</p>
          <ul className="astro-list">{events.map((e, i) => <li key={i}>{e.icon} <b>{fmtDay(e.date)}</b> — {e.title}</li>)}</ul>
        </AstroCard>
      </div>
      {d ? (
        <AstroCard title="System-wide horoscope themes">
          <p>With the Moon in {sky.moon.sign}, the day's shared tone is <b>{d.theme}</b>. A {topEl} emphasis across your alters suggests leaning on {topEl === 'Fire' ? 'action and expression' : topEl === 'Earth' ? 'steadiness and practicality' : topEl === 'Air' ? 'conversation and ideas' : 'feeling and intuition'} together.</p>
          <p>🧠 System prompt: {d.prompt}</p>
        </AstroCard>
      ) : null}
      <Disclaimer />
    </>
  );
}

/** A stable position per alter, ordered by zodiac so the constellation reads like a sky. */
function pos(sign: Astro.SignName, i: number, all: Subject[]): [number, number] {
  const idx = Astro.SIGN_NAMES.indexOf(sign);
  const sameSign = all.slice(0, i).filter((s) => s.profile.sun === sign).length;
  const x = 8 + (idx / 11) * 84;
  const y = 22 + ((idx * 37 + sameSign * 29) % 56);
  return [x, y];
}
