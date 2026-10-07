import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Astro } from '@pluralnova/shared';
import { PageHeader } from '../../app/PageHeader.js';
import { useFronting } from '../../core/fronting.js';
import { Button } from '../../ui/primitives.js';
import { EmptyState, SkeletonList } from '../../ui/feedback.js';
import { BirthDetailsDialog } from './BirthDetails.js';
import { subjectOf, useAstroContext } from './data.js';
import { AstroCard } from './ui.js';
import Today from './panels/Today.js';
import Chart from './panels/Chart.js';
import Horoscope from './panels/Horoscope.js';
import Tarot from './panels/Tarot.js';
import Compat from './panels/Compat.js';
import MoonCalendar from './panels/MoonCalendar.js';
import SolarCalendar from './panels/SolarCalendar.js';
import Energy from './panels/Energy.js';
import News from './panels/News.js';
import Chat from './panels/Chat.js';
import SystemHub from './panels/SystemHub.js';
import AstroCalendar from './panels/AstroCalendar.js';
import './astro.css';

/** Preserved across re-mounts so clicking a tab doesn't snap the bar back to the start. */
let astroTabScroll = 0;

const SECTIONS = [
  { id: 'today', label: "Today's Sky", icon: '🌌' },
  { id: 'chart', label: 'Birth Chart', icon: '♈' },
  { id: 'horoscope', label: 'Horoscope', icon: '☀️' },
  { id: 'tarot', label: 'Tarot', icon: '🃏' },
  { id: 'compatibility', label: 'Compatibility', icon: '❤️' },
  { id: 'moon', label: 'Moon Calendar', icon: '🌙' },
  { id: 'solar', label: 'Solar Calendar', icon: '☀️' },
  { id: 'energy', label: 'Energy', icon: '⚡' },
  { id: 'news', label: 'Astrology News', icon: '📰' },
  { id: 'chat', label: 'Astrology Chat', icon: '💬' },
  { id: 'system', label: 'System Astrology', icon: '🪐' },
  { id: 'calendar', label: 'Astro Calendar', icon: '📅' },
] as const;

/** Tiny animated stars — skipped on low-end devices and for reduced motion. */
function useCalm(): boolean {
  const [calm] = useState(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduced || (nav.deviceMemory ?? 8) <= 2 || (nav.hardwareConcurrency ?? 8) <= 2;
  });
  return calm;
}
const STARS = Array.from({ length: 36 }, (_, i) => ({
  left: `${(i * 53) % 100}%`, top: `${(i * 37 + (i % 5) * 11) % 100}%`, delay: `${(i % 9) * 0.45}s`, size: 1 + (i % 3) * 0.6,
}));

export default function AstroPage(): JSX.Element {
  const { section = 'today' } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ctx = useAstroContext();
  const fronting = useFronting();
  const [editing, setEditing] = useState(false);
  const calm = useCalm();
  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const tabRef = useRef<HTMLDivElement>(null);

  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [section]);

  // Restore the tab bar's horizontal scroll on mount, save it on unmount —
  // the Layout keys content by pathname, so every tab click remounts this
  // component and the scrollLeft would otherwise reset to 0.
  useEffect(() => {
    if (tabRef.current) tabRef.current.scrollLeft = astroTabScroll;
    const el = tabRef.current;
    return () => { if (el) astroTabScroll = el.scrollLeft; };
  }, []);

  if (ctx.loading) return <SkeletonList rows={4} />;
  const subject = ctx.selected;

  if (!subject) {
    return <EmptyState title="Add an alter to begin" body="Astro builds a profile for each alter from their saved birthday. Add one in Members first." action={{ label: 'Go to Members', run: () => navigate('/members') }} />;
  }

  const search = params.get('alter') ? `?alter=${params.get('alter')}` : '';
  const frontingSubjects = fronting.state.fronting.map((m) => subjectOf(m, ctx.viewerId)).filter((s) => s.canView && s.profile.sun);
  const hiddenCount = ctx.subjects.length - ctx.visible.length;
  const editBirth = (): void => setEditing(true);

  const body = !subject.canView ? (
    <AstroCard title="🔒 Astrology is private">
      <p>
        {subject.visibility === 'hidden'
          ? `${subject.name} has hidden their astrology information.`
          : `${subject.name} keeps their astrology private. Birth information is never shared automatically.`}
      </p>
      {subject.canEdit ? <Button variant="primary" onClick={editBirth}>Change astrology visibility</Button> : null}
    </AstroCard>
  ) : section === 'news' ? <News />
    : section === 'system' ? <SystemHub subjects={ctx.visible} fronting={frontingSubjects} hiddenCount={hiddenCount} select={ctx.select} />
      : section === 'chart' ? <Chart subject={subject} editBirth={editBirth} />
        : section === 'horoscope' ? <Horoscope subject={subject} editBirth={editBirth} />
          : section === 'tarot' ? <Tarot subject={subject} />
            : section === 'compatibility' ? <Compat subject={subject} others={ctx.visible} editBirth={editBirth} />
              : section === 'moon' ? <MoonCalendar subject={subject} />
                : section === 'solar' ? <SolarCalendar subject={subject} />
                  : section === 'energy' ? <Energy subject={subject} editBirth={editBirth} />
                    : section === 'chat' ? <Chat subject={subject} others={ctx.visible} />
                      : section === 'calendar' ? <AstroCalendar subject={subject} subjects={ctx.visible} />
                        : <Today subject={subject} editBirth={editBirth} />;

  return (
    <div className={`astro ${calm ? 'astro--calm' : ''}`} style={{ ['--astro-accent' as never]: subject.color }}>
      <div className="astro__stars" aria-hidden>
        {STARS.map((s, i) => <i key={i} style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />)}
      </div>
      <PageHeader
        title="🌌 Astro"
        description="Astrology-inspired reflection for every alter — built from saved birth details, never guessed."
        actions={subject.canEdit ? <Button size="sm" onClick={editBirth}>Birth details</Button> : undefined}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: 'var(--space-3) 0' }}>
        <label htmlFor="astro-alter">Reading for</label>
        <select id="astro-alter" className="astro-select" value={subject.id} onChange={(e) => ctx.select(e.target.value)}>
          {[...ctx.visible, ...(ctx.visible.some((v) => v.id === subject.id) ? [] : [subject])].map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {subject.canView && subject.profile.sun ? <span>{Astro.signInfo(subject.profile.sun).glyph} {subject.profile.sun}</span> : null}
      </div>

      <nav className="astro-tabs" aria-label="Astro sections" ref={tabRef}>
        {SECTIONS.map((s) => (
          <button key={s.id} aria-current={current!.id === s.id ? 'page' : undefined} onClick={() => navigate(`/astro/${s.id}${search}`)}>{s.icon} {s.label}</button>
        ))}
      </nav>

      {body}
      <BirthDetailsDialog subject={subject} open={editing} onClose={() => setEditing(false)} />
      <p className="astro-note"><Link to="/journal">Journal</Link> · Astro is free — deeper detail comes from richer birth data, never from a paywall.</p>
    </div>
  );
}
