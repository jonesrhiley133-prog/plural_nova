import { useMemo, useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { useCollection } from '../../../core/data.js';
import { TextField, SelectField } from '../../../ui/forms.js';
import { AstroCard, Disclaimer, NeedsBirthday, Unlock } from '../ui.js';
import { inputOf, signLine, type Subject } from '../data.js';

interface Other { key: string; name: string; profile: Astro.AstroProfile; kind: string }

export default function Compat({ subject, others, editBirth }: { subject: Subject; others: Subject[]; editBirth: () => void }): JSX.Element {
  const contacts = useCollection('contacts');
  const [choice, setChoice] = useState('');
  const [manual, setManual] = useState({ name: '', birthday: '', time: '', place: '' });

  const options = useMemo<Other[]>(() => {
    const alters = others.filter((o) => o.id !== subject.id).map((o) => ({ key: `alter:${o.id}`, name: o.name, profile: o.profile, kind: 'Alter / system member' }));
    const people = contacts.items.filter((c) => c['birthday']).map((c) => ({ key: `contact:${c.id}`, name: String(c['name'] ?? c['displayName'] ?? 'Contact'), profile: Astro.buildProfile(inputOf(c)), kind: 'Contact' }));
    const place = Astro.PLACES.find((p) => p.name === manual.place);
    const man = manual.birthday ? [{
      key: 'manual', name: manual.name || 'Someone', kind: 'Entered manually',
      profile: Astro.buildProfile({ birthday: manual.birthday, birthTime: manual.time || null, latitude: place?.latitude ?? null, longitude: place?.longitude ?? null, utcOffset: place?.utcOffset ?? null }),
    }] : [];
    return [...alters, ...people, ...man];
  }, [others, contacts.items, manual, subject.id]);

  if (subject.profile.level === 'none') return <NeedsBirthday name={subject.name} action={editBirth} />;
  const other = options.find((o) => o.key === choice);
  const result = other ? Astro.compare(subject.profile, other.profile, { me: subject.name, other: other.name }) : null;

  return (
    <>
      <AstroCard title={`❤️ Compare ${subject.name} with…`}>
        <div className="stack">
          <SelectField label="Another alter, system member or contact" value={choice === 'manual' ? '' : choice} placeholder="Choose someone…" options={options.filter((o) => o.key !== 'manual').map((o) => ({ value: o.key, label: `${o.name} — ${o.kind}` }))} onChange={setChoice} />
          <p><b>Or anyone, entered manually:</b></p>
          <TextField label="Name" value={manual.name} onChange={(v) => setManual((m) => ({ ...m, name: v }))} />
          <TextField label="Birthday" type="date" value={manual.birthday} onChange={(v) => { setManual((m) => ({ ...m, birthday: v })); if (v) setChoice('manual'); }} />
          <TextField label="Birth time (optional)" type="time" value={manual.time} onChange={(v) => setManual((m) => ({ ...m, time: v }))} />
          <SelectField label="Birthplace (optional)" value={manual.place} placeholder="Choose a city…" options={Astro.PLACES.map((p) => ({ value: p.name, label: p.name }))} onChange={(v) => setManual((m) => ({ ...m, place: v }))} />
        </div>
        {!options.length ? <p className="astro-note">No other alters with visible astrology yet — alters decide their own astrology visibility.</p> : null}
      </AstroCard>

      {other && !result ? <Unlock>{other.name} needs a birthday to compare.</Unlock> : null}
      {result && other ? (
        <>
          <AstroCard title={`${subject.name} ↔ ${other.name}: ${result.headline}`}>
            <p>{result.summary}</p>
            <p>{signLine(subject.profile).join(' · ')}<br />{signLine(other.profile).join(' · ')}</p>
          </AstroCard>
          <div className="astro-grid">
            <AstroCard title="Basic compatibility">
              <ul className="astro-list">{result.pairs.map((p) => <li key={p.label}><b>{p.label}:</b> {p.a} ↔ {p.b} — {p.relation}</li>)}</ul>
            </AstroCard>
            <AstroCard title="Dynamics">
              <ul className="astro-list">
                {result.categories.map((c) => (
                  <li key={c.id}>{c.emoji} <b>{c.name}</b> <span className={`astro-flow astro-flow--${c.flow.replace(' ', '-')}`}>{c.flow}</span><br />{c.text}</li>
                ))}
              </ul>
            </AstroCard>
          </div>
          <AstroCard title="Advanced: synastry aspects">
            {result.advanced ? (
              result.synastry.length ? <ul className="astro-list">{result.synastry.map((s, i) => <li key={i}>{s.text}</li>)}</ul> : <p>No close aspects between the Sun, Moon, Mercury, Venus and Mars of these charts.</p>
            ) : <Unlock>{result.advancedPrompt}</Unlock>}
          </AstroCard>
        </>
      ) : null}
      <Disclaimer text="Relationships are not numbers — there is deliberately no compatibility percentage. Read this as a conversation starter, not a verdict." />
    </>
  );
}
