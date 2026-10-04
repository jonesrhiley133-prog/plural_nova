import { useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { AstroCard, Disclaimer, EnergyBars, NeedsBirthday } from '../ui.js';
import { localDay, reader, type Subject } from '../data.js';
import { ReflectionForm, ReflectionHistory } from './Reflection.js';

export default function Energy({ subject, editBirth }: { subject: Subject; editBirth: () => void }): JSX.Element {
  const [day] = useState(() => localDay());
  if (subject.profile.level === 'none') return <NeedsBirthday name={subject.name} action={editBirth} />;
  const d = Astro.dailyReading(subject.profile, reader(subject), day);

  return (
    <>
      <AstroCard title={`⚡ Energy of the day for ${subject.name}`}>
        <p><b>Overall:</b> {d.energy}% — an astrology-themed reflection tool, not a medical or scientific measurement.</p>
        <EnergyBars energies={d.energies} />
      </AstroCard>
      <AstroCard title="📝 How I actually felt today">
        <ReflectionForm subject={subject} reading={d} />
      </AstroCard>
      <AstroCard title="📚 Astrology Reflection History">
        <ReflectionHistory subject={subject} />
      </AstroCard>
      <Disclaimer text="Comparing a reading with how you felt is for your own self-reflection. The stars are not claimed to cause any mood or energy level." />
    </>
  );
}
