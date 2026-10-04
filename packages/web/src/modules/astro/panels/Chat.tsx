import { useEffect, useRef, useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { Markdown } from '../../../ui/Markdown.js';
import { AstroCard, Disclaimer } from '../ui.js';
import { localDay, reader, type Subject } from '../data.js';

interface Msg { from: 'user' | 'bot'; text: string }

export default function Chat({ subject, others }: { subject: Subject; others: Subject[] }): JSX.Element {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const end = useRef<HTMLDivElement>(null);

  // A different alter is a different conversation — it must not leak the previous alter's chart.
  useEffect(() => setMsgs([{ from: 'bot', text: `Hi! I'm the Astro guide. I already know ${subject.name}'s saved chart${subject.profile.sun ? ` (${subject.profile.sun} Sun)` : ''}, so just ask.` }]), [subject.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [msgs]);

  const ask = (q: string): void => {
    const text = q.trim();
    if (!text) return;
    const reply = Astro.astroReply(text, {
      name: subject.name, profile: subject.profile, reader: reader(subject), today: localDay(),
      others: others.filter((o) => o.id !== subject.id).map((o) => ({ name: o.name, profile: o.profile })),
    });
    setMsgs((m) => [...m, { from: 'user', text }, { from: 'bot', text: reply }]);
    setInput('');
  };

  const suggestions = ['What does my Moon sign traditionally represent?', 'Explain my birth chart.', 'What does Venus in Libra mean?', 'Give me a reflective reading for today.', ...(others.filter((o) => o.id !== subject.id)[0] ? [`Compare my chart with ${others.filter((o) => o.id !== subject.id)[0]!.name}'s.`] : [])];

  return (
    <AstroCard title={`💬 Astrology Chat — ${subject.name}`}>
      <div className="astro-chat" aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={`astro-msg astro-msg--${m.from}`}>{m.from === 'bot' ? <Markdown text={m.text} /> : m.text}</div>
        ))}
        <div ref={end} />
      </div>
      <div className="astro-chips" style={{ margin: '12px 0' }}>{suggestions.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} style={{ display: 'flex', gap: 8 }}>
        <input className="astro-select" style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your chart…" aria-label="Ask the astrology guide" />
        <button className="astro-pill" type="submit">Send</button>
      </form>
      <Disclaimer text="This guide runs inside PluralNova using the saved chart — no external AI service. Answers are traditional/reflective, not predictions." />
    </AstroCard>
  );
}
