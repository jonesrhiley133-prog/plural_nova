import { useState, type ReactNode } from 'react';
import {
  DEFAULT_GRADIENT,
  parseHex,
  type ElementMode,
  type ElementStyle,
  type GradientSpec,
} from '@pluralnova/shared';
import { Button, SegmentedControl } from '../../ui/primitives.js';
import { ColorField, SwitchRow } from '../../ui/forms.js';

/**
 * Small, reusable editor controls. Each one shows the inherited value as its
 * resting state and a "Reset" affordance only once something is overridden,
 * so it is always clear what is customised and what is just following the
 * base theme.
 */

export function RangeRow({
  label,
  value,
  fallback,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  onChange,
  onClear,
}: {
  label: string;
  value: number | undefined;
  fallback: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
  onClear?: () => void;
}): JSX.Element {
  const shown = value ?? fallback;
  return (
    <label className="field" style={{ display: 'block' }}>
      <span className="row row--between" style={{ alignItems: 'baseline' }}>
        <span className="field__label">{label}</span>
        <span className="tiny faint">
          {shown}
          {unit}
          {value !== undefined && onClear ? (
            <>
              {' · '}
              <button type="button" onClick={onClear} style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer', font: 'inherit' }}>
                Reset
              </button>
            </>
          ) : (
            ' · inherited'
          )}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  );
}

export function ColorRow({
  label,
  value,
  fallback,
  onChange,
  onClear,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}): JSX.Element {
  const safeFallback = parseHex(fallback) ? fallback : '#7aa2f7';
  return (
    <div>
      <ColorField label={label} value={value ?? safeFallback} onChange={onChange} hint={value === undefined ? 'Inherited from the theme' : undefined} />
      {value !== undefined && onClear ? (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Use theme colour
        </Button>
      ) : null}
    </div>
  );
}

export function Group({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="stack" style={{ gap: 'var(--space-3)' }}>
      <h3 className="small" style={{ margin: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function GradientEditor({
  value,
  onChange,
}: {
  value: GradientSpec | null | undefined;
  onChange: (value: GradientSpec | null) => void;
}): JSX.Element {
  const g = value ?? null;
  if (!g) {
    return (
      <Button variant="secondary" size="sm" onClick={() => onChange({ ...DEFAULT_GRADIENT })}>
        Add a gradient
      </Button>
    );
  }
  const patch = (next: Partial<GradientSpec>): void => onChange({ ...g, ...next });
  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <div
        aria-label="Gradient preview"
        style={{
          height: 44,
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          background:
            g.kind === 'radial'
              ? `radial-gradient(circle, ${g.colors.join(', ')})`
              : `linear-gradient(${g.angle}deg, ${g.colors.join(', ')})`,
        }}
      />
      {g.colors.map((color, i) => (
        <div key={i} className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <ColorField
              label={`Colour ${i + 1}`}
              value={color}
              onChange={(next) => patch({ colors: g.colors.map((c, j) => (j === i ? next : c)) })}
            />
          </div>
          {g.colors.length > 2 ? (
            <Button variant="ghost" size="sm" onClick={() => patch({ colors: g.colors.filter((_, j) => j !== i) })}>
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      {g.colors.length < 5 ? (
        <Button variant="ghost" size="sm" onClick={() => patch({ colors: [...g.colors, g.colors[g.colors.length - 1] ?? '#ffffff'] })}>
          Add colour
        </Button>
      ) : null}
      <SegmentedControl
        label="Gradient style"
        value={g.kind}
        onChange={(kind) => patch({ kind })}
        options={[
          { value: 'linear', label: 'Linear' },
          { value: 'radial', label: 'Radial' },
        ]}
      />
      {g.kind === 'linear' ? (
        <>
          <RangeRow label="Angle" value={g.angle} fallback={135} max={360} unit="°" onChange={(angle) => patch({ angle })} />
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {(
              [
                ['Up', 0],
                ['Right', 90],
                ['Down', 180],
                ['Left', 270],
                ['Diagonal', 135],
              ] as const
            ).map(([name, angle]) => (
              <Button key={name} variant="ghost" size="sm" onClick={() => patch({ angle })}>
                {name}
              </Button>
            ))}
          </div>
        </>
      ) : null}
      <RangeRow label="Opacity" value={g.opacity} fallback={100} unit="%" onChange={(opacity) => patch({ opacity })} />
      <RangeRow label="Intensity" value={g.intensity} fallback={100} min={10} unit="%" onChange={(intensity) => patch({ intensity })} />
      <SwitchRow
        label="Animated"
        hint="Slowly shifts the gradient. Turned off automatically in performance mode."
        checked={g.animated}
        onChange={(animated) => patch({ animated })}
      />
      {g.animated ? <RangeRow label="Animation cycle" value={g.speed} fallback={12} min={2} max={60} unit="s" onChange={(speed) => patch({ speed })} /> : null}
      <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
        Remove gradient
      </Button>
    </div>
  );
}

/** Full editor for one element's override (also used for an item theme). */
export function ElementStyleEditor({
  value,
  onChange,
  onReset,
}: {
  value: ElementStyle | undefined;
  onChange: (patch: Partial<ElementStyle>) => void;
  onReset: () => void;
}): JSX.Element {
  const [more, setMore] = useState(false);
  const s = value ?? {};
  const mode: ElementMode = s.mode ?? 'inherit';
  return (
    <div className="stack" style={{ gap: 'var(--space-3)' }}>
      <SegmentedControl
        label="Fill"
        value={mode}
        onChange={(next) => onChange({ mode: next })}
        options={[
          { value: 'inherit', label: 'Inherit' },
          { value: 'solid', label: 'Solid' },
          { value: 'gradient', label: 'Gradient' },
        ]}
      />
      {mode === 'solid' ? (
        <>
          <ColorRow label="Fill colour" value={s.color} fallback="#19223c" onChange={(color) => onChange({ color })} />
          <RangeRow label="Opacity" value={s.opacity} fallback={100} unit="%" onChange={(opacity) => onChange({ opacity })} />
        </>
      ) : null}
      {mode === 'gradient' ? (
        <GradientEditor value={s.gradient} onChange={(gradient) => onChange({ gradient })} />
      ) : null}
      <Button variant="ghost" size="sm" onClick={() => setMore((open) => !open)}>
        {more ? 'Fewer options' : 'More options'}
      </Button>
      {more ? (
        <>
          <ColorRow label="Text colour" value={s.textColor} fallback="#e7ecf8" onChange={(textColor) => onChange({ textColor })} onClear={() => onChange({ textColor: undefined })} />
          <ColorRow label="Accent" value={s.accent} fallback="#7aa2f7" onChange={(accent) => onChange({ accent })} onClear={() => onChange({ accent: undefined })} />
          <ColorRow label="Border colour" value={s.borderColor} fallback="#2b3659" onChange={(borderColor) => onChange({ borderColor })} onClear={() => onChange({ borderColor: undefined })} />
          <RangeRow label="Border thickness" value={s.borderWidth} fallback={1} max={8} unit="px" onChange={(borderWidth) => onChange({ borderWidth })} onClear={() => onChange({ borderWidth: undefined })} />
          <RangeRow label="Corner radius" value={s.radius} fallback={14} max={48} unit="px" onChange={(radius) => onChange({ radius })} onClear={() => onChange({ radius: undefined })} />
          <RangeRow label="Blur" value={s.blur} fallback={0} max={40} unit="px" onChange={(blur) => onChange({ blur })} onClear={() => onChange({ blur: undefined })} />
          <SegmentedControl
            label="Shadow"
            value={s.shadow === undefined ? 'inherit' : s.shadow ? 'on' : 'off'}
            onChange={(next) => onChange({ shadow: next === 'inherit' ? undefined : next === 'on' })}
            options={[
              { value: 'inherit', label: 'Inherit' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
        </>
      ) : null}
      <Button variant="ghost" size="sm" onClick={onReset}>
        Reset this element
      </Button>
    </div>
  );
}
