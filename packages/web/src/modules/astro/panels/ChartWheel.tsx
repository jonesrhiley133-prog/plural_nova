import { Astro } from '@pluralnova/shared';

const ELEMENT_COLOR: Record<Astro.Element, string> = { Fire: '#ff8a5c', Earth: '#7ccf8f', Air: '#8bd5ff', Water: '#a78bfa' };
const C = 230;
const pt = (angleDeg: number, r: number): [number, number] => {
  const a = (angleDeg * Math.PI) / 180;
  return [C + r * Math.cos(a), C - r * Math.sin(a)];
};

/** Interactive circular natal chart. The ascendant sits on the left, like a traditional wheel. */
export function ChartWheel({ profile, selected, onSelect }: { profile: Astro.AstroProfile; selected: Astro.PlanetId | null; onSelect: (id: Astro.PlanetId) => void }): JSX.Element {
  const asc = profile.ascendant ?? 0;
  const ang = (lon: number): number => 180 - (((lon - asc) % 360) + 360) % 360;

  // Nudge crowded planets apart so every one stays tappable.
  const placed = profile.placements
    .filter((p) => p.longitude !== null)
    .map((p) => ({ p, lon: p.longitude as number, shown: p.longitude as number }))
    .sort((a, b) => a.lon - b.lon);
  for (let pass = 0; pass < 6; pass += 1) {
    for (let i = 1; i < placed.length; i += 1) {
      const gap = placed[i]!.shown - placed[i - 1]!.shown;
      if (gap < 9) { placed[i]!.shown += (9 - gap) / 2; placed[i - 1]!.shown -= (9 - gap) / 2; }
    }
  }

  return (
    <svg className="astro-wheel" viewBox="0 0 460 460" role="group" aria-label="Interactive birth chart">
      <circle cx={C} cy={C} r={218} fill="#0a0f2a" stroke="var(--glass-edge)" />
      {Astro.SIGNS.map((s, i) => {
        const start = ang(i * 30);
        const mid = start - 15;
        const [x1, y1] = pt(start, 218);
        const [x2, y2] = pt(start, 176);
        const [gx, gy] = pt(mid, 197);
        return (
          <g key={s.name}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--glass-edge)" />
            <text x={gx} y={gy} textAnchor="middle" dominantBaseline="central" fontSize="18" style={{ fill: ELEMENT_COLOR[s.element] }}>{s.glyph}</text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r={176} fill="none" stroke="var(--glass-edge)" />
      <circle cx={C} cy={C} r={92} fill="rgb(255 255 255 / .02)" stroke="var(--glass-edge)" />
      <g className="astro-orbit"><circle cx={C} cy={C} r={134} fill="none" stroke="rgb(255 255 255 / .08)" strokeDasharray="2 6" /></g>
      {profile.houseCusps.map((h) => {
        const [x1, y1] = pt(ang(h.longitude), 176);
        const [x2, y2] = pt(ang(h.longitude), 92);
        const [tx, ty] = pt(ang(h.longitude) - 15, 108);
        return (
          <g key={h.house}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={h.house === 1 || h.house === 7 ? '#fff9' : 'rgb(255 255 255 / .15)'} />
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central" fontSize="10" opacity={0.5}>{h.house}</text>
          </g>
        );
      })}
      {profile.aspects.filter((a) => a.a !== 'ascendant' && a.b !== 'ascendant').slice(0, 24).map((a, i) => {
        const pa = profile.placements.find((p) => p.id === a.a)!;
        const pb = profile.placements.find((p) => p.id === a.b)!;
        const [x1, y1] = pt(ang(pa.longitude as number), 90);
        const [x2, y2] = pt(ang(pb.longitude as number), 90);
        const color = a.aspect.tone === 'challenging' || a.aspect.tone === 'polarising' ? '#ff9db5' : a.aspect.tone === 'merging' ? '#f0c36a' : '#7ee2c0';
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity={0.45} />;
      })}
      {placed.map(({ p, shown }) => {
        const info = Astro.planetInfo(p.id);
        const [x, y] = pt(ang(shown), 150);
        return (
          <g
            key={p.id} className="planet" role="button" tabIndex={0} aria-pressed={selected === p.id}
            aria-label={`${info.name} in ${p.sign}`} onClick={() => onSelect(p.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } }}
          >
            <circle cx={x} cy={y} r={14} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="15">{info.glyph}</text>
          </g>
        );
      })}
    </svg>
  );
}
