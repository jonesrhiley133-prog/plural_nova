import { useMemo, useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { useCollection } from '../../../core/data.js';
import { useToast } from '../../../core/toast.js';
import { Button } from '../../../ui/primitives.js';
import { TextField } from '../../../ui/forms.js';
import { fmtDay, type Subject } from '../data.js';

const LEVELS = ['low', 'medium', 'high'] as const;

/** Records how a day actually felt next to what the reading suggested. */
export function ReflectionForm({ subject, reading }: { subject: Subject; reading: Astro.DailyReading }): JSX.Element {
  const entries = useCollection('astroEntries', { filter: (e) => e['memberId'] === subject.id });
  const toast = useToast();
  const existing = entries.all.find((e) => e['memberId'] === subject.id && e['entryDate'] === reading.date);
  const [mood, setMood] = useState('');
  const [energy, setEnergy] = useState<(typeof LEVELS)[number]>('medium');
  const [text, setText] = useState('');
  const [fit, setFit] = useState<boolean | null>(null);

  const save = async (): Promise<void> => {
    const payload = {
      memberId: subject.id, entryDate: reading.date, theme: reading.theme, moonPhase: reading.moon.phase,
      readingEnergy: reading.energy, reportedMood: mood, reportedEnergy: energy, reflection: text, fit,
    };
    try {
      if (existing) await entries.update(existing.id, payload);
      else await entries.create(payload);
      toast.success('Reflection saved');
      setMood(''); setText('');
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  return (
    <div className="stack">
      {existing ? <p className="astro-note">You already saved a reflection for today — saving again updates it.</p> : null}
      <TextField label="Reported mood" value={mood} onChange={setMood} placeholder="Calm, buzzy, tired…" />
      <div className="astro-chips" role="group" aria-label="Reported energy">
        {LEVELS.map((l) => <button key={l} aria-pressed={energy === l} onClick={() => setEnergy(l)}>Energy: {l}</button>)}
        <button aria-pressed={fit === true} onClick={() => setFit(fit === true ? null : true)}>👍 The reading fit</button>
        <button aria-pressed={fit === false} onClick={() => setFit(fit === false ? null : false)}>👎 It didn't fit</button>
      </div>
      <TextField label="How I actually felt today" value={text} onChange={setText} multiline rows={3} />
      <div><Button variant="primary" onClick={() => void save()}>Save reflection</Button></div>
    </div>
  );
}

/** The Astrology Reflection History, with a gentle comparison of reading vs. report. */
export function ReflectionHistory({ subject }: { subject: Subject }): JSX.Element {
  const entries = useCollection('astroEntries', { filter: (e) => e['memberId'] === subject.id });
  const list = useMemo(() => [...entries.items].sort((a, b) => String(b['entryDate']).localeCompare(String(a['entryDate']))), [entries.items]);
  const fits = list.filter((e) => e['fit'] === true).length;
  const judged = list.filter((e) => e['fit'] === true || e['fit'] === false).length;

  if (!list.length) return <p>No reflections yet. Save one from Today's Sky and your history will appear here.</p>;
  return (
    <>
      {judged ? <p className="astro-note">You marked {fits} of {judged} readings as a fit. That is your own pattern to observe — the stars did not cause your mood.</p> : null}
      <ul className="astro-list">
        {list.slice(0, 30).map((e) => (
          <li key={e.id}>
            <b>{fmtDay(String(e['entryDate']))}</b><br />
            🌙 Astrology theme: {String(e['theme'] ?? '—')}{e['readingEnergy'] != null ? ` (reading energy ${String(e['readingEnergy'])}%)` : ''}<br />
            💭 Reported mood: {String(e['reportedMood'] || '—')}<br />
            ⚡ Reported energy: {String(e['reportedEnergy'] ?? '—')}<br />
            {e['reflection'] ? <>📝 Alter reflection: “{String(e['reflection'])}”</> : null}
          </li>
        ))}
      </ul>
    </>
  );
}
