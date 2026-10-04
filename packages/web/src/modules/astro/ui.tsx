import type { ReactNode } from 'react';
import { Astro } from '@pluralnova/shared';

export function AstroCard({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }): JSX.Element {
  return (
    <section className={`astro-card ${className}`}>
      {title ? <h3>{title}</h3> : null}
      {children}
    </section>
  );
}

export function Disclaimer({ text = Astro.DISCLAIMER }: { text?: string }): JSX.Element {
  return <p className="astro-note">{text}</p>;
}

export function Unlock({ children }: { children: ReactNode }): JSX.Element {
  return <div className="astro-unlock">🔓 {children}</div>;
}

export function Bar({ value }: { value: number }): JSX.Element {
  return (
    <div className="astro-bar" role="img" aria-label={`${value}%`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }): JSX.Element {
  return (
    <dl className="astro-kv">
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EnergyBars({ energies }: { energies: Record<Astro.EnergyKey, number> }): JSX.Element {
  return (
    <div className="astro-energy">
      {Astro.ENERGY_KEYS.map((k) => (
        <div className="astro-energy__row" key={k} title={Astro.ENERGY_META[k].description}>
          <span>{Astro.ENERGY_META[k].emoji} {Astro.ENERGY_META[k].label}</span>
          <Bar value={energies[k]} />
          <span>{energies[k]}%</span>
        </div>
      ))}
    </div>
  );
}

/** Message for a profile with nothing but a missing birthday. */
export function NeedsBirthday({ name, action }: { name: string; action?: () => void }): JSX.Element {
  return (
    <AstroCard title="✨ Add a birthday to begin">
      <p>Add a birthday for {name} to unlock a Sun sign and zodiac profile. Adding a birth time and birthplace later unlocks the Rising sign and complete birth chart.</p>
      {action ? <button className="astro-pill" onClick={action}>Add birth details</button> : null}
    </AstroCard>
  );
}
