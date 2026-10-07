import { Link } from 'react-router-dom';
import { Astro, type StoredRecord } from '@pluralnova/shared';
import { useActiveMemberId } from '../../core/auth.js';
import { Card } from '../../ui/primitives.js';
import { localDay, reader, subjectOf } from './data.js';

/**
 * Alter Profile → Astrology. Respects the alter's own astrology privacy:
 * a viewer who isn't allowed to see it gets nothing at all, not a teaser.
 */
export function AstroSummaryCard({ member, withToday = false }: { member: StoredRecord; withToday?: boolean }): JSX.Element | null {
  const viewerId = useActiveMemberId();
  const s = subjectOf(member, viewerId);
  if (!s.canView) return null;
  const p = s.profile;
  const today = withToday && p.level !== 'none' ? Astro.dailyReading(p, reader(s), localDay()) : null;

  return (
    <Card title="🌌 Astrology" subtitle="Astrology-inspired reflection, not prediction">
      {p.sun ? (
        <>
          <p style={{ fontSize: 'var(--size-md)', margin: 0 }}>{Astro.signInfo(p.sun).glyph} {p.sun}</p>
          <p style={{ margin: 'var(--space-2) 0' }}>
            ☀️ {p.sun} Sun{p.moon ? <><br />🌙 {p.moon} Moon</> : null}{p.rising ? <><br />⬆️ {p.rising} Rising</> : null}
          </p>
          {today ? <p className="faint">✨ Today's theme: {today.theme} · {today.moon.emoji} Moon in {today.moon.sign}</p> : null}
          {p.unlockPrompt ? <p className="faint">{p.unlockPrompt}</p> : null}
        </>
      ) : <p className="faint">{p.unlockPrompt}</p>}
      <Link to={`/astro/today?alter=${member.id}`}>View Full Astrology Profile →</Link>
    </Card>
  );
}
