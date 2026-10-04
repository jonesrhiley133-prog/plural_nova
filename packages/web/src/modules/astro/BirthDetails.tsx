import { useEffect, useState } from 'react';
import { Astro } from '@pluralnova/shared';
import { useCollection } from '../../core/data.js';
import { useToast } from '../../core/toast.js';
import { Button } from '../../ui/primitives.js';
import { NumberField, SelectField, TextField } from '../../ui/forms.js';
import { Dialog } from '../../ui/overlays.js';
import type { Subject } from './data.js';

/** Birth details and astrology privacy for one alter. Writes straight to the member record. */
export function BirthDetailsDialog({ subject, open, onClose }: { subject: Subject; open: boolean; onClose: () => void }): JSX.Element {
  const members = useCollection('members', { enabled: false });
  const toast = useToast();
  const m = subject.member;
  const [form, setForm] = useState({ birthday: '', birthTime: '', birthPlace: '', lat: null as number | null, lon: null as number | null, offset: null as number | null, visibility: 'private' as string });

  useEffect(() => {
    if (!open) return;
    const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
    setForm({
      birthday: String(m['birthday'] ?? ''), birthTime: String(m['birthTime'] ?? ''), birthPlace: String(m['birthPlace'] ?? ''),
      lat: num(m['birthLatitude']), lon: num(m['birthLongitude']), offset: num(m['birthUtcOffset']), visibility: subject.visibility,
    });
  }, [open, m, subject.visibility]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => setForm((f) => ({ ...f, [key]: value }));

  const save = async (): Promise<void> => {
    try {
      await members.update(subject.id, {
        birthday: form.birthday || null, birthTime: form.birthTime || null, birthPlace: form.birthPlace || null,
        birthLatitude: form.lat, birthLongitude: form.lon, birthUtcOffset: form.offset, astroVisibility: form.visibility,
      });
      toast.success('Astrology details saved');
      onClose();
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Birth details for ${subject.name}`}
      description="A birthday gives the Sun sign. Birth time, birthplace and UTC offset unlock the Rising sign, houses and full chart. Nothing is guessed."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()}>Save</Button></>}
    >
      <div className="stack">
        <TextField label="Birthday" type="date" value={form.birthday} onChange={(v) => set('birthday', v)} />
        <TextField label="Birth time (local, optional)" type="time" value={form.birthTime} onChange={(v) => set('birthTime', v)} />
        <SelectField
          label="Birthplace quick-fill"
          value={form.birthPlace}
          placeholder="Choose a city…"
          options={Astro.PLACES.map((p) => ({ value: p.name, label: p.name }))}
          onChange={(name) => {
            const p = Astro.PLACES.find((x) => x.name === name);
            setForm((f) => ({ ...f, birthPlace: name, ...(p ? { lat: p.latitude, lon: p.longitude, offset: p.utcOffset } : {}) }));
          }}
          hint="Fills coordinates and the standard UTC offset. Add an hour if you were born during daylight saving."
        />
        <TextField label="Birthplace (name)" value={form.birthPlace} onChange={(v) => set('birthPlace', v)} />
        <NumberField label="Latitude" value={form.lat} onChange={(v) => set('lat', v)} min={-90} max={90} step={0.01} />
        <NumberField label="Longitude (east +, west −)" value={form.lon} onChange={(v) => set('lon', v)} min={-180} max={180} step={0.01} />
        <NumberField label="UTC offset at birth (hours)" value={form.offset} onChange={(v) => set('offset', v)} min={-12} max={14} step={0.5} />
        <SelectField
          label="Who can see this alter's astrology?"
          value={form.visibility}
          options={Astro.ASTRO_VISIBILITY.map((v) => ({ value: v.value, label: v.label }))}
          onChange={(v) => set('visibility', v || 'private')}
          hint="Birth information never becomes visible to others just because it was entered."
        />
      </div>
    </Dialog>
  );
}
