import { useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { useCollection } from '../../../core/data.js';
import { useToast } from '../../../core/toast.js';
import { Button } from '../../../ui/primitives.js';
import { TextField } from '../../../ui/forms.js';
import { AstroCard, Disclaimer } from '../ui.js';
import { fmtDay, localDay, type Subject } from '../data.js';

function CardView({ card, reversed, position, shown, onFlip }: { card: Astro.TarotCard; reversed: boolean; position?: string; shown: boolean; onFlip: () => void }): JSX.Element {
  return (
    <div className="tarot-card">
      {position ? <div className="tarot-card__pos">{position}</div> : null}
      <button className={`tarot-card__face ${shown ? '' : 'is-hidden'} ${reversed ? 'is-reversed' : ''}`} onClick={onFlip} aria-label={shown ? `${card.name}${reversed ? ' reversed' : ''}` : 'Reveal card'}>
        {shown ? <><span className="glyph">{card.glyph}</span><b>{card.name}</b><small>{reversed ? 'Reversed' : 'Upright'}</small></> : <span className="glyph">🂠</span>}
      </button>
    </div>
  );
}

function Meaning({ card, reversed }: { card: Astro.TarotCard; reversed: boolean }): JSX.Element {
  return (
    <>
      <p><b>{card.name} — {reversed ? 'reversed' : 'upright'}:</b> {reversed ? card.reversed : card.upright}</p>
      <p><b>Reflection:</b> {card.reflection}</p>
      <p><b>Relationships:</b> {card.relationship}</p>
      <p><b>Personal growth:</b> {card.growth}</p>
    </>
  );
}

export default function Tarot({ subject }: { subject: Subject }): JSX.Element {
  const toast = useToast();
  const readings = useCollection('tarotReadings', { filter: (r) => r['memberId'] === subject.id });
  const [spreadId, setSpreadId] = useState('three');
  const [drawn, setDrawn] = useState<Astro.DrawnCard[] | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');

  const today = localDay();
  const daily = Astro.drawSpread(Astro.SPREADS[0]!, `${subject.id}|${Astro.dateKey(today)}|tarot`)[0]!;
  const dailyCard = Astro.cardById(daily.cardId)!;
  const [dailyShown, setDailyShown] = useState(false);
  const spread = Astro.SPREADS.find((s) => s.id === spreadId)!;

  const draw = (): void => { setDrawn(Astro.drawSpread(spread)); setRevealed(new Set()); setNote(''); };
  const flip = (i: number): void => setRevealed((r) => new Set(r).add(i));
  const save = async (): Promise<void> => {
    if (!drawn) return;
    try {
      await readings.create({ memberId: subject.id, spreadId: spread.id, spreadName: spread.name, drawnAt: new Date().toISOString(), cards: drawn, note });
      toast.success('Reading saved');
    } catch (cause) { toast.fromError(cause); }
  };

  return (
    <>
      <AstroCard title={`🃏 Today's Card for ${subject.name}`}>
        <div style={{ maxWidth: 190 }}>
          <CardView card={dailyCard} reversed={daily.reversed} shown={dailyShown} onFlip={() => setDailyShown(true)} />
        </div>
        {dailyShown ? <Meaning card={dailyCard} reversed={daily.reversed} /> : <p>Tap the card to reveal it. The same card stays yours for the whole day.</p>}
      </AstroCard>

      <AstroCard title="Spreads">
        <div className="astro-chips" role="group" aria-label="Spread">
          {Astro.SPREADS.map((s) => <button key={s.id} aria-pressed={spreadId === s.id} onClick={() => { setSpreadId(s.id); setDrawn(null); }}>{s.name}</button>)}
        </div>
        <p style={{ marginTop: 12 }}>{spread.description}</p>
        <ol className="astro-list">{spread.positions.map((p) => <li key={p.label}>{p.emoji} {p.label}</li>)}</ol>
        <div style={{ marginTop: 12 }}><Button variant="primary" onClick={draw}>{drawn ? 'Shuffle & draw again' : 'Shuffle & draw'}</Button></div>
      </AstroCard>

      {drawn ? (
        <AstroCard title={`${spread.name} — ${fmtDay(today)}`}>
          <div className="astro-tarot">
            {drawn.map((c, i) => <CardView key={i} card={Astro.cardById(c.cardId)!} reversed={c.reversed} position={c.position} shown={revealed.has(i)} onFlip={() => flip(i)} />)}
          </div>
          <div className="astro-chips" style={{ margin: '12px 0' }}><button onClick={() => setRevealed(new Set(drawn.map((_, i) => i)))}>Reveal all</button></div>
          {drawn.map((c, i) => revealed.has(i) ? (
            <div key={i} className="astro-list"><li><b>{c.position}</b><Meaning card={Astro.cardById(c.cardId)!} reversed={c.reversed} /></li></div>
          ) : null)}
          <TextField label="My reflection" value={note} onChange={setNote} multiline rows={3} />
          <Button onClick={() => void save()}>Save reading</Button>
        </AstroCard>
      ) : null}

      <AstroCard title="Saved readings">
        {readings.items.length ? (
          <ul className="astro-list">
            {[...readings.items].sort((a, b) => String(b['drawnAt']).localeCompare(String(a['drawnAt']))).slice(0, 15).map((r) => (
              <li key={r.id}>
                <b>{String(r['spreadName'])}</b> · {fmtDay(String(r['drawnAt']).slice(0, 10))}<br />
                {((r['cards'] as Astro.DrawnCard[]) ?? []).map((c) => `${c.position}: ${Astro.cardById(c.cardId)?.name ?? '?'}${c.reversed ? ' (rev.)' : ''}`).join(' · ')}
                {r['note'] ? <><br />📝 {String(r['note'])}</> : null}
              </li>
            ))}
          </ul>
        ) : <p>No saved readings yet.</p>}
      </AstroCard>
      <Disclaimer text={Astro.TAROT_DISCLAIMER} />
    </>
  );
}
