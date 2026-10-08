import { useMemo, useState } from 'react';
import { countBy, intensityLabel, topEntries, type StoredRecord } from '@pluralnova/shared';
import { useCollection } from '../../core/data.js';
import { useDateFormat } from '../../core/i18n.js';
import { useToast } from '../../core/toast.js';
import { Button, Card, Chip, IconButton, Stat } from '../../ui/primitives.js';
import { NumberField, TagField, TextField } from '../../ui/forms.js';
import { AsyncContent } from '../../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../../ui/overlays.js';
import { Icon } from '../../ui/Icon.js';

/**
 * Symptoms.
 *
 * A small, separate log — physical, emotional, or anything else worth
 * noting, not limited to the cycle. `cycleEntries.symptoms` stays a bare tag
 * on a cycle day; this is the fuller record that tag can only summarise,
 * with its own intensity and duration. There is no built-in list of
 * symptoms, the same way Cycle's own phases have none — whatever you call
 * it is what gets saved, and past names are offered back as a shortcut.
 */

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'physical', label: 'Physical' },
  { value: 'emotional', label: 'Emotional' },
  { value: 'other', label: 'Other' },
];

export function Symptoms(): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();
  const entries = useCollection('symptomEntries');
  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(false);

  const knownNames = useMemo(
    () => topEntries(countBy(entries.items, (entry) => String(entry['name'] ?? '').trim() || null), 10).map((entry) => entry.key),
    [entries.items],
  );

  const mostCommon = useMemo(() => {
    const top = topEntries(countBy(entries.items, (entry) => String(entry['name'] ?? '').trim() || null), 1)[0];
    return top ?? null;
  }, [entries.items]);

  const averageIntensity = useMemo(() => {
    const values = entries.items.map((entry) => Number(entry['intensity'] ?? 0)).filter((n) => n > 0);
    if (values.length === 0) return null;
    return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
  }, [entries.items]);

  return (
    <>
      <div className="row row--between" style={{ marginBottom: 'var(--space-4)', alignItems: 'flex-start' }}>
        <p className="small faint" style={{ margin: 0, maxWidth: 260 }}>
          Physical, emotional, or anything else worth a note — not limited to the cycle.
        </p>
        <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
          Log a symptom
        </Button>
      </div>

      {entries.items.length > 0 ? (
        <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
          <Stat label="Logged" value={entries.items.length} />
          <Stat label="Most common" value={mostCommon ? mostCommon.key : '—'} detail={mostCommon ? `${mostCommon.count} times` : undefined} />
          <Stat label="Average intensity" value={averageIntensity !== null ? `${averageIntensity}/5` : '—'} />
        </div>
      ) : null}

      <AsyncContent
        loading={entries.loading}
        error={entries.error}
        items={entries.items}
        onRetry={entries.reload}
        empty={{
          title: 'Nothing logged yet',
          body: 'Log a symptom whenever something is worth noting.',
          icon: 'body',
          action: { label: 'Log a symptom', run: () => setCreating(true) },
        }}
      >
        {(records) => (
          <Card flush>
            <div className="list">
              {records.map((entry) => (
                <div key={entry.id} className="list-row">
                  <span className="list-row__icon" aria-hidden="true">
                    <Icon name="body" size={16} />
                  </span>
                  <span className="list-row__body">
                    <span className="list-row__title">
                      {String(entry['name'])}
                      <span className="faint"> · {CATEGORIES.find((c) => c.value === entry['category'])?.label ?? 'Physical'}</span>
                    </span>
                    <span className="list-row__meta">
                      <span>{dates.relative(String(entry['recordedAt']))}</span>
                      <Chip>{intensityLabel(Number(entry['intensity'] ?? 3))}</Chip>
                      {entry['durationMinutes'] ? <span className="faint">{String(entry['durationMinutes'])} min</span> : null}
                    </span>
                    {entry['note'] ? (
                      <p className="tiny muted prose clamp-2" style={{ marginTop: 'var(--space-1)' }}>
                        {String(entry['note'])}
                      </p>
                    ) : null}
                  </span>
                  <span className="list-row__trailing">
                    <IconButton icon="edit" label="Edit symptom" variant="ghost" size="sm" onClick={() => editor.show(entry)} />
                    <IconButton icon="trash" label="Delete symptom" variant="ghost" size="sm" onClick={() => confirm.show(entry)} />
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </AsyncContent>

      <SymptomDialog
        open={creating || editor.open}
        record={editor.value}
        knownNames={knownNames}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        onSave={async (values) => {
          if (editor.value) {
            await entries.update(editor.value.id, values);
            toast.success('Saved');
          } else {
            await entries.create(values);
            toast.success('Symptom logged');
          }
        }}
      />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this symptom?"
        body="It is removed from the list and from the averages above."
        onConfirm={async () => {
          if (!confirm.value) return;
          await entries.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

function SymptomDialog({
  open,
  record,
  knownNames,
  onClose,
  onSave,
}: {
  open: boolean;
  record: StoredRecord | null;
  knownNames: string[];
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('physical');
  const [intensity, setIntensity] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const targetId = record?.id ?? 'new';
  if (open && loadedId !== targetId) {
    setLoadedId(targetId);
    setName(record ? String(record['name'] ?? '') : '');
    setCategory(record ? String(record['category'] ?? 'physical') : 'physical');
    setIntensity(record ? ((record['intensity'] as number) ?? 3) : 3);
    setDurationMinutes(record ? ((record['durationMinutes'] as number) ?? null) : null);
    setNote(record ? String(record['note'] ?? '') : '');
    setTags(record ? ((record['tags'] as string[]) ?? []) : []);
  }
  if (!open && loadedId !== null) setLoadedId(null);

  const save = async (): Promise<void> => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        category,
        intensity,
        durationMinutes,
        recordedAt: record ? String(record['recordedAt']) : new Date().toISOString(),
        note,
        tags,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={record ? 'Edit symptom' : 'Log a symptom'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <TextField label="Symptom" value={name} onChange={setName} hint="Whatever you call it — there's no built-in list." />
      {knownNames.length > 0 ? (
        <div className="row" style={{ marginTop: 'calc(var(--space-4) * -1)', marginBottom: 'var(--space-4)' }}>
          {knownNames.map((option) => (
            <Chip key={option} onClick={() => setName(option)}>
              {option}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="field">
        <span className="field__label">Category</span>
        <div className="row">
          {CATEGORIES.map((option) => (
            <Chip key={option.value} selected={category === option.value} onClick={() => setCategory(option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Intensity</span>
        <div className="row">
          {[1, 2, 3, 4, 5].map((level) => (
            <Chip key={level} selected={intensity === level} onClick={() => setIntensity(level)}>
              {intensityLabel(level)}
            </Chip>
          ))}
        </div>
      </div>

      <NumberField label="Duration (minutes)" value={durationMinutes} onChange={setDurationMinutes} min={0} />
      <TagField label="Tags" values={tags} onChange={setTags} />
      <TextField label="Note" value={note} onChange={setNote} multiline rows={2} />
    </Dialog>
  );
}
