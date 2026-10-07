import { Button, IconButton } from './primitives.js';
import { TextField } from './forms.js';

export interface LabelledRow {
  label: string;
  value: string;
}

/** Reads a stored `[{label, value}]` value defensively; anything else is an empty list. */
export function parseRows(value: unknown): LabelledRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is LabelledRow => Boolean(row) && typeof row === 'object')
    .map((row) => ({ label: String(row.label ?? ''), value: String(row.value ?? '') }));
}

/** Editor for free-form labelled rows: custom information, or headed sections. */
export function LabelledRowsField({
  label,
  hint,
  value,
  onChange,
  multiline,
}: {
  label: string;
  hint?: string;
  value: unknown;
  onChange: (value: LabelledRow[]) => void;
  multiline?: boolean;
}): JSX.Element {
  const rows = parseRows(value);
  const patch = (index: number, next: Partial<LabelledRow>): void =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...next } : row)));

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      {hint ? <span className="field__hint tiny faint">{hint}</span> : null}
      <div className="stack stack--tight">
        {rows.map((row, index) => (
          <div key={index} className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 35%', minWidth: 0 }}>
              <TextField label="Label" value={row.label} onChange={(next) => patch(index, { label: next })} />
            </div>
            <div style={{ flex: '1 1 55%', minWidth: 0 }}>
              <TextField
                label={multiline ? 'Text' : 'Value'}
                value={row.value}
                onChange={(next) => patch(index, { value: next })}
                {...(multiline ? { multiline: true, rows: 3 } : {})}
              />
            </div>
            <IconButton
              icon="trash"
              label="Remove row"
              variant="ghost"
              size="sm"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            />
          </div>
        ))}
        <div>
          <Button variant="ghost" size="sm" icon="plus" onClick={() => onChange([...rows, { label: '', value: '' }])}>
            {multiline ? 'Add section' : 'Add row'}
          </Button>
        </div>
      </div>
    </div>
  );
}
