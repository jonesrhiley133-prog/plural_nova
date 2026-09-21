import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { ACCENT_PRESETS, type FieldDef } from '@pluralnova/shared';
import { Icon } from './Icon.js';
import { Button, Chip } from './primitives.js';

/**
 * Form controls.
 *
 * Each one pairs its input with a label, a hint and an error slot, wired
 * together by id so the association survives for a screen reader. Errors are
 * rendered where the mistake is, not collected at the top.
 */

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps): JSX.Element {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            required
          </span>
        ) : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          <Icon name="warning" size={12} /> {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  required,
  placeholder,
  type = 'text',
  autoComplete,
  multiline,
  rows,
  maxLength,
  inputMode,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  inputMode?: 'text' | 'email' | 'numeric' | 'decimal' | 'tel' | 'url' | 'search';
  autoFocus?: boolean;
}): JSX.Element {
  return (
    <Field
      label={label}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(required ? { required } : {})}
    >
      {({ id, describedBy, invalid }) =>
        multiline ? (
          <textarea
            id={id}
            className="textarea"
            value={value}
            rows={rows ?? 5}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            placeholder={placeholder}
            maxLength={maxLength}
            autoFocus={autoFocus}
          />
        ) : (
          <input
            id={id}
            className="input"
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            placeholder={placeholder}
            autoComplete={autoComplete}
            inputMode={inputMode}
            maxLength={maxLength}
            autoFocus={autoFocus}
          />
        )
      }
    </Field>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  error,
  suffix,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  error?: string;
  suffix?: string;
}): JSX.Element {
  return (
    <Field label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      {({ id, describedBy, invalid }) => (
        <div className="row row--nowrap">
          <input
            id={id}
            className="input"
            type="number"
            inputMode="decimal"
            value={value ?? ''}
            min={min}
            max={max}
            step={step}
            onChange={(event) =>
              onChange(event.target.value === '' ? null : Number(event.target.value))
            }
            aria-describedby={describedBy}
            aria-invalid={invalid}
          />
          {suffix ? <span className="small muted">{suffix}</span> : null}
        </div>
      )}
    </Field>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
  placeholder?: string;
}): JSX.Element {
  return (
    <Field label={label} {...(hint ? { hint } : {})} {...(error ? { error } : {})}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          className="select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        >
          <option value="">{placeholder ?? 'Not set'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function DateTimeField({
  label,
  value,
  onChange,
  hint,
  error,
  dateOnly,
  required,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  hint?: string;
  error?: string;
  dateOnly?: boolean;
  required?: boolean;
}): JSX.Element {
  // `datetime-local` wants local wall-clock time; storage is always UTC ISO.
  const local = useMemo(() => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, dateOnly ? 10 : 16);
  }, [value, dateOnly]);

  return (
    <Field
      label={label}
      {...(hint ? { hint } : {})}
      {...(error ? { error } : {})}
      {...(required ? { required } : {})}
    >
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="input"
          type={dateOnly ? 'date' : 'datetime-local'}
          value={local}
          onChange={(event) => {
            const next = event.target.value;
            if (!next) {
              onChange(null);
              return;
            }
            onChange(dateOnly ? next : new Date(next).toISOString());
          }}
          aria-describedby={describedBy}
          aria-invalid={invalid}
        />
      )}
    </Field>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className="switch"
      data-on={checked}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span className="switch__knob" />
    </button>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="switch-row" style={disabled ? { opacity: 0.55 } : undefined}>
      <div className="checkbox-row__text">
        <span className="checkbox-row__title">{label}</span>
        {hint ? <span className="checkbox-row__hint">{hint}</span> : null}
      </div>
      <Switch checked={checked} onChange={disabled ? () => undefined : onChange} label={label} />
    </div>
  );
}

/** Free-form tags: type and press Enter or comma, backspace removes the last. */
export function TagField({
  label,
  values,
  onChange,
  hint,
  suggestions = [],
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  hint?: string;
  suggestions?: string[];
}): JSX.Element {
  const [draft, setDraft] = useState('');

  const add = (raw: string): void => {
    const tag = raw.trim();
    if (!tag || values.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...values, tag]);
    setDraft('');
  };

  const unused = suggestions.filter((suggestion) => !values.includes(suggestion)).slice(0, 8);

  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      {({ id, describedBy }) => (
        <div className="stack stack--tight">
          {values.length > 0 ? (
            <div className="row">
              {values.map((tag) => (
                <Chip key={tag} onClick={() => onChange(values.filter((value) => value !== tag))}>
                  {tag} <Icon name="close" size={11} />
                </Chip>
              ))}
            </div>
          ) : null}
          <input
            id={id}
            className="input"
            value={draft}
            aria-describedby={describedBy}
            placeholder="Type and press Enter"
            onChange={(event) => {
              const next = event.target.value;
              if (next.endsWith(',')) add(next.slice(0, -1));
              else setDraft(next);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add(draft);
              } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
                onChange(values.slice(0, -1));
              }
            }}
            onBlur={() => add(draft)}
          />
          {unused.length > 0 ? (
            <div className="row">
              {unused.map((suggestion) => (
                <Chip key={suggestion} onClick={() => add(suggestion)}>
                  + {suggestion}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Field>
  );
}

export function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}): JSX.Element {
  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      {({ id }) => (
        <div className="stack stack--tight">
          <div className="row row--nowrap">
            <input
              id={id}
              type="color"
              className="input"
              style={{ width: 52, padding: 4, minHeight: 42 }}
              value={value || '#7aa2f7'}
              onChange={(event) => onChange(event.target.value)}
              aria-label={`${label} colour picker`}
            />
            <input
              className="input"
              value={value}
              placeholder="#7aa2f7"
              onChange={(event) => onChange(event.target.value)}
              aria-label={`${label} hex value`}
            />
            {value ? (
              <Button variant="ghost" size="sm" onClick={() => onChange('')}>
                Clear
              </Button>
            ) : null}
          </div>
          <div className="row">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange(preset.accent)}
                title={preset.label}
                aria-label={preset.label}
                aria-pressed={value.toLowerCase() === preset.accent.toLowerCase()}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: preset.accent,
                  border:
                    value.toLowerCase() === preset.accent.toLowerCase()
                      ? '2px solid var(--text)'
                      : '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </Field>
  );
}

/** Choose one or several records from a collection — members, playlists, folders. */
export function ReferenceField({
  label,
  value,
  options,
  onChange,
  multiple,
  hint,
  emptyLabel = 'Nobody in particular',
}: {
  label: string;
  value: string | string[] | null;
  options: { id: string; label: string; color?: string | null; icon?: string | null }[];
  onChange: (value: string | string[] | null) => void;
  multiple?: boolean;
  hint?: string;
  emptyLabel?: string;
}): JSX.Element {
  const selected = multiple ? ((value as string[]) ?? []) : value ? [value as string] : [];

  const toggle = (id: string): void => {
    if (multiple) {
      const next = selected.includes(id)
        ? selected.filter((candidate) => candidate !== id)
        : [...selected, id];
      onChange(next);
    } else {
      onChange(selected.includes(id) ? null : id);
    }
  };

  return (
    <Field label={label} {...(hint ? { hint } : {})}>
      {() =>
        options.length === 0 ? (
          <p className="small faint">Nothing to choose from yet.</p>
        ) : (
          <div className="row" role="group" aria-label={label}>
            {!multiple ? (
              <Chip selected={selected.length === 0} onClick={() => onChange(null)}>
                {emptyLabel}
              </Chip>
            ) : null}
            {options.map((option) => (
              <Chip
                key={option.id}
                selected={selected.includes(option.id)}
                onClick={() => toggle(option.id)}
                color={option.color ?? null}
              >
                {option.icon ? `${option.icon} ` : ''}
                {option.label}
              </Chip>
            ))}
          </div>
        )
      }
    </Field>
  );
}

/** A search box with a clear affordance and a debounce, used across every list. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}): JSX.Element {
  return (
    <div style={{ position: 'relative' }}>
      <span
        style={{
          position: 'absolute',
          left: 11,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-faint)',
          pointerEvents: 'none',
        }}
      >
        <Icon name="search" size={16} />
      </span>
      <input
        type="search"
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        style={{ paddingLeft: 36, paddingRight: value ? 36 : undefined }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: 'var(--text-faint)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}

/** Debounces a fast-changing value so a list does not re-filter per keystroke. */
export function useDebounced<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function FileButton({
  label,
  accept,
  onFile,
  variant = 'secondary',
}: {
  label: string;
  accept?: string;
  onFile: (file: File) => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}): JSX.Element {
  const input = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) onFile(file);
      // Reset so choosing the same file twice still fires a change.
      event.target.value = '';
    },
    [onFile],
  );

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        onChange={handle}
        className="visually-hidden"
        tabIndex={-1}
      />
      <Button variant={variant} icon="upload" onClick={() => input.current?.click()}>
        {label}
      </Button>
    </>
  );
}

export { type FieldDef };
