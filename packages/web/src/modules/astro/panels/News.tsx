import { useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { AstroCard, Disclaimer } from '../ui.js';

export default function News(): JSX.Element {
  const [cat, setCat] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);
  const list = Astro.ARTICLES.filter((a) => cat === 'all' || a.category === cat);
  return (
    <>
      <div className="astro-chips" role="group" aria-label="Categories" style={{ marginBottom: 'var(--space-3)' }}>
        <button aria-pressed={cat === 'all'} onClick={() => setCat('all')}>All</button>
        {Astro.NEWS_CATEGORIES.map((c) => <button key={c.id} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.emoji} {c.label}</button>)}
      </div>
      {list.map((a) => {
        const meta = Astro.NEWS_CATEGORIES.find((c) => c.id === a.category)!;
        const isOpen = open === a.id;
        return (
          <AstroCard key={a.id} title={a.title}>
            <p>{meta.emoji} {meta.label} · {a.summary}</p>
            {isOpen ? (
              <>
                <p><b>Traditional astrology:</b> {a.tradition}</p>
                <p><b>What science says:</b> {a.science}</p>
              </>
            ) : null}
            <button className="astro-pill" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen}>{isOpen ? 'Show less' : 'Read more'}</button>
          </AstroCard>
        );
      })}
      <Disclaimer text="Articles keep traditional astrological belief and scientific evidence clearly separate: astrology is a symbolic tradition, not a tested predictive science." />
    </>
  );
}
