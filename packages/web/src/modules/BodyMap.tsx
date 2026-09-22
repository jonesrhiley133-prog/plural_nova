import { useMemo, useState } from 'react';
import { BODY_REGIONS, SENSATION_WORDS, intensityLabel, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecordMap } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, IconButton, Meter } from '../ui/primitives.js';
import { TextField } from '../ui/forms.js';
import { AsyncContent, DescriptiveNote } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { magnitudeColor } from '../charts/palette.js';

/**
 * Body sensations.
 *
 * An outline you tap, then a word for what it feels like. Regions are plain
 * anatomy with no interpretation attached; the tint on the figure shows how
 * often an area has been logged, and nothing more.
 */

interface Region {
  id: string;
  label: string;
  /** Path on a 120×300 figure. */
  path: string;
}

const FIGURE: Region[] = [
  { id: 'head', label: 'Head', path: 'M60 8a17 17 0 0 1 17 17v6a17 17 0 0 1-34 0v-6A17 17 0 0 1 60 8Z' },
  { id: 'face', label: 'Face', path: 'M49 24h22v9a11 11 0 0 1-22 0Z' },
  { id: 'neck', label: 'Neck', path: 'M52 48h16v10H52Z' },
  { id: 'shoulders', label: 'Shoulders', path: 'M30 58h60v12H30Z' },
  { id: 'chest', label: 'Chest', path: 'M36 70h48v30H36Z' },
  { id: 'heart', label: 'Heart area', path: 'M44 76h18v18H44Z' },
  { id: 'arms', label: 'Arms', path: 'M18 62h14v76H18ZM88 62h14v76H88Z' },
  { id: 'hands', label: 'Hands', path: 'M18 138h14v16H18ZM88 138h14v16H88Z' },
  { id: 'stomach', label: 'Stomach', path: 'M38 100h44v34H38Z' },
  { id: 'hips', label: 'Hips', path: 'M36 134h48v18H36Z' },
  { id: 'legs', label: 'Legs', path: 'M40 152h17v82H40ZM63 152h17v82H63Z' },
  { id: 'knees', label: 'Knees', path: 'M40 196h17v14H40ZM63 196h17v14H63Z' },
  { id: 'feet', label: 'Feet', path: 'M38 234h20v14H38ZM62 234h20v14H62Z' },
];

export default function BodyMap(): JSX.Element {
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const activeMemberId = useActiveMemberId();
  const members = useRecordMap('members');
  const entries = useCollection('bodySensations');

  const editor = useDialog<{ region: string; record: StoredRecord | null }>();
  const confirm = useDialog<StoredRecord>();

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries.items) {
      const key = String(entry['region']);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [entries.items]);

  const maxCount = Math.max(...counts.values(), 1);

  return (
    <>
      <PageHeader
        title={t('body.title')}
        description="Tap where something is happening, then say what it feels like."
      />

      <div className="split">
        <Card title="Where" subtitle="Shaded areas are the ones logged most often">
          <div style={{ display: 'grid', placeItems: 'center' }}>
            <svg
              viewBox="0 0 120 260"
              width="100%"
              style={{ maxWidth: 260 }}
              role="group"
              aria-label="Body outline. Select an area to record a sensation."
            >
              {FIGURE.map((region) => {
                const count = counts.get(region.id) ?? 0;
                return (
                  <path
                    key={region.id}
                    d={region.path}
                    fill={count > 0 ? magnitudeColor(count / maxCount) : 'var(--surface-sunken)'}
                    stroke="var(--border-strong)"
                    strokeWidth={0.8}
                    opacity={count > 0 ? 0.9 : 0.55}
                    style={{ cursor: 'pointer' }}
                    onClick={() => editor.show({ region: region.id, record: null })}
                    role="button"
                    tabIndex={0}
                    aria-label={`${region.label}${count > 0 ? `, ${count} logged` : ''}`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        editor.show({ region: region.id, record: null });
                      }
                    }}
                  />
                );
              })}
            </svg>
          </div>

          <div className="row" style={{ marginTop: 'var(--space-4)' }}>
            {BODY_REGIONS.filter(
              (region) => !FIGURE.some((shape) => shape.id === region.id),
            ).map((region) => (
              <Chip key={region.id} onClick={() => editor.show({ region: region.id, record: null })}>
                {region.label}
              </Chip>
            ))}
          </div>
        </Card>

        <div className="stack">
          <AsyncContent
            loading={entries.loading}
            error={entries.error}
            items={entries.items}
            onRetry={entries.reload}
            empty={{
              title: 'Nothing recorded yet',
              body: 'Tap an area on the figure to log the first one.',
              icon: 'body',
            }}
          >
            {(records) => (
              <Card title="Recent" flush>
                <div className="list">
                  {records.slice(0, 20).map((entry) => {
                    const region = BODY_REGIONS.find((item) => item.id === entry['region']);
                    const member = entry['memberId'] ? members.get(String(entry['memberId'])) : null;
                    const intensity = Number(entry['intensity'] ?? 3);
                    const side = String(entry['side'] ?? 'both');
                    return (
                      <div key={entry.id} className="list-row">
                        <span className="list-row__body">
                          <span className="list-row__title">
                            {String(entry['sensation'])}
                            <span className="faint"> · {region?.label ?? String(entry['region'])}</span>
                            {side !== 'both' ? (
                              <span className="faint"> · {side[0]!.toUpperCase() + side.slice(1)}</span>
                            ) : null}
                          </span>
                          <span className="list-row__meta">
                            <span>{dates.relative(String(entry['recordedAt']))}</span>
                            <span className="faint">{intensityLabel(intensity)}</span>
                            {member ? (
                              <Chip color={(member['color'] as string) ?? null}>
                                {String(member['name'])}
                              </Chip>
                            ) : null}
                            {entry['note'] ? (
                              <span className="faint truncate">{String(entry['note'])}</span>
                            ) : null}
                          </span>
                        </span>
                        <span className="list-row__trailing">
                          <Meter value={intensity} max={5} label={`Intensity ${intensity} of 5`} />
                          <IconButton
                            icon="edit"
                            label="Edit entry"
                            variant="ghost"
                            size="sm"
                            onClick={() => editor.show({ region: String(entry['region']), record: entry })}
                          />
                          <IconButton
                            icon="trash"
                            label="Delete entry"
                            variant="ghost"
                            size="sm"
                            onClick={() => confirm.show(entry)}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </AsyncContent>

          <DescriptiveNote>
            {term(
              'This is a record of where and what, nothing more. PluralNova does not read anything into it, and it is not a substitute for medical advice.',
            )}
          </DescriptiveNote>
        </div>
      </div>

      <SensationDialog
        dialog={editor}
        onSave={async (values) => {
          await entries.create({ ...values, memberId: activeMemberId });
          toast.success('Recorded');
        }}
        onUpdate={async (id, values) => {
          await entries.update(id, values);
          toast.success('Saved');
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this entry?"
        body="It is removed from the list and from the figure's tally."
        onConfirm={async () => {
          if (!confirm.value) return;
          await entries.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

function SensationDialog({
  dialog,
  onSave,
  onUpdate,
}: {
  dialog: ReturnType<typeof useDialog<{ region: string; record: StoredRecord | null }>>;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [sensation, setSensation] = useState('');
  const [intensity, setIntensity] = useState(3);
  const [side, setSide] = useState('both');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const record = dialog.value?.record ?? null;
  const region = BODY_REGIONS.find((item) => item.id === dialog.value?.region);
  const key = record ? record.id : (dialog.value?.region ?? null);

  if (dialog.open && loadedKey !== key) {
    setLoadedKey(key);
    setSensation(record ? String(record['sensation'] ?? '') : '');
    setIntensity(record ? Number(record['intensity'] ?? 3) : 3);
    setSide(record ? String(record['side'] ?? 'both') : 'both');
    setNote(record ? String(record['note'] ?? '') : '');
  }
  if (!dialog.open && loadedKey !== null) setLoadedKey(null);

  const save = async (): Promise<void> => {
    if (!sensation.trim() || !dialog.value) return;
    setSaving(true);
    try {
      const payload = {
        region: dialog.value.region,
        sensation: sensation.trim(),
        intensity,
        side,
        note,
        ...(record ? {} : { recordedAt: new Date().toISOString() }),
      };
      if (record) await onUpdate(record.id, payload);
      else await onSave(payload);
      dialog.hide();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title={region ? `${region.label}` : 'Record a sensation'}
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!sensation.trim()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="field">
        <span className="field__label">What does it feel like?</span>
        <div className="row">
          {SENSATION_WORDS.map((word) => (
            <Chip key={word} selected={sensation === word} onClick={() => setSensation(word)}>
              {word}
            </Chip>
          ))}
        </div>
      </div>

      <TextField label="Or your own word" value={sensation} onChange={setSensation} />

      <div className="field">
        <span className="field__label">How strong?</span>
        <div className="row">
          {[1, 2, 3, 4, 5].map((level) => (
            <Chip key={level} selected={intensity === level} onClick={() => setIntensity(level)}>
              {intensityLabel(level)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Side</span>
        <div className="row">
          {['both', 'left', 'right', 'centre'].map((option) => (
            <Chip key={option} selected={side === option} onClick={() => setSide(option)}>
              {option[0]!.toUpperCase() + option.slice(1)}
            </Chip>
          ))}
        </div>
      </div>

      <TextField label="Note" value={note} onChange={setNote} multiline rows={2} />
    </Dialog>
  );
}
