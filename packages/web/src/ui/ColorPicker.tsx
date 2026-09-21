import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  contrastRatio,
  formatHsl,
  formatRgb,
  hexToHsv,
  hsvToHex,
  hsvToHsl,
  hsvToRgb,
  parseHex,
  parseHslString,
  parseRgbString,
  toHex,
  type Hsv,
} from '@pluralnova/shared';
import { Icon } from './Icon.js';

/**
 * The one colour picker.
 *
 * Every place in the app that lets somebody choose a colour — a member's
 * profile colour, a folder, the accent in Settings, the accent in onboarding —
 * renders this. Before it existed, each of those had its own hand-built row of
 * small `<button style={{ background: ... }}>` swatches, which is how "pick a
 * colour" ended up meaning three visually unrelated things depending on which
 * screen asked. A user should not have to learn this control twice.
 *
 * It is deliberately not always fully open: the swatch and hex value are
 * enough for the common case of confirming or lightly adjusting an existing
 * colour, and the saturation/value square only costs its space once somebody
 * asks for it. `defaultOpen` is for the one place — the theme accent, in
 * Settings — where picking a colour from nothing is the entire point of the
 * screen.
 */

const RECENT_KEY = 'pluralnova.recentColors';
const MAX_RECENT = 8;
const FALLBACK_HSV: Hsv = { h: 220, s: 0.5, v: 0.9 };

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

function rememberRecent(hex: string): void {
  try {
    const existing = readRecent().filter((c) => c.toLowerCase() !== hex.toLowerCase());
    localStorage.setItem(RECENT_KEY, JSON.stringify([hex, ...existing].slice(0, MAX_RECENT)));
  } catch {
    /* Private browsing or a full quota loses recent colours, not the colour itself. */
  }
}

/**
 * One colour, as a button. The single visual every swatch grid in the app now
 * shares — presets, recent colours, the picker's own confirm state.
 */
export function ColorSwatch({
  color,
  selected,
  onClick,
  label,
  size = 28,
}: {
  color: string;
  selected?: boolean;
  onClick?: () => void;
  label: string;
  size?: number;
}): JSX.Element {
  return (
    <button
      type="button"
      className="color-swatch"
      style={{ '--swatch-size': `${size}px`, background: color } as never}
      onClick={onClick}
      aria-label={label}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      title={label}
    >
      {selected ? (
        <Icon name="check" size={Math.round(size * 0.5)} className="color-swatch__check" />
      ) : null}
    </button>
  );
}

type Format = 'hex' | 'rgb' | 'hsl';

/** A draggable point on the saturation/value square. */
function SvSquare({
  hsv,
  onChange,
}: {
  hsv: Hsv;
  onChange: (next: Pick<Hsv, 's' | 'v'>) => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  const fromPointer = (event: { clientX: number; clientY: number }): void => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return;
    const s = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const v = Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height));
    onChange({ s, v });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    // Not every WebView implements this — this app ships as one, on Android —
    // and an unguarded call throws before the colour under the finger is ever
    // read, which would make the whole square appear to not respond to touch
    // at all rather than merely lose the "keep dragging past the edge" nicety
    // pointer capture provides.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    fromPointer(event);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, Pick<Hsv, 's' | 'v'>> = {
      ArrowRight: { s: Math.min(1, hsv.s + step), v: hsv.v },
      ArrowLeft: { s: Math.max(0, hsv.s - step), v: hsv.v },
      ArrowUp: { s: hsv.s, v: Math.min(1, hsv.v + step) },
      ArrowDown: { s: hsv.s, v: Math.max(0, hsv.v - step) },
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    onChange(next);
  };

  // The pure hue at full saturation/value — the square tints toward this, from
  // white at the near corner to black at the far one, which is the standard
  // HSV layout and needs no third gradient layer to draw.
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div
      ref={ref}
      className="color-picker__sv"
      style={{ background: hueColor }}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => event.buttons === 1 && fromPointer(event)}
    >
      <div className="color-picker__sv-white" />
      <div className="color-picker__sv-black" />
      <div
        className="color-picker__sv-thumb"
        role="slider"
        tabIndex={0}
        aria-label="Saturation and brightness"
        aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
        onKeyDown={onKeyDown}
        style={{
          left: `${hsv.s * 100}%`,
          top: `${(1 - hsv.v) * 100}%`,
          background: hsvToHex(hsv),
        }}
      />
    </div>
  );
}

export function ColorPicker({
  value,
  onChange,
  presets,
  defaultOpen = false,
  showContrastAgainst,
}: {
  value: string;
  onChange: (hex: string) => void;
  /** Curated starting points shown above the recent-colours row. */
  presets?: readonly { id: string; label: string; accent: string }[];
  defaultOpen?: boolean;
  /**
   * When set, a small readable/not-readable note is shown comparing the
   * current colour against this background — for the theme accent, where
   * legibility is the whole reason the picker exists; not shown for an
   * ordinary record colour, where it would just be noise.
   */
  showContrastAgainst?: string;
}): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const [format, setFormat] = useState<Format>('hex');
  const [editingText, setEditingText] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(() => readRecent());

  /*
   * HSV lives as its own float-precision state rather than being re-derived
   * from `value` on every render. Hex is only 8 bits per channel, so most
   * one-degree nudges of hue round-trip to the exact hex they started from —
   * derive the slider's position from that hex every time and dragging it
   * looks like it works and then springs back, because the position the user
   * left it at and the position the stored colour implies are not quite the
   * same number. Only re-sync from `value` when it changed to something this
   * picker did not itself just commit: a preset click elsewhere, a theme
   * reset, another tab editing the same record.
   */
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(parseHex(value) ? value : '#7aa2f7') ?? FALLBACK_HSV);
  const lastCommitted = useRef(hsvToHex(hsv));

  useEffect(() => {
    if (value.toLowerCase() === lastCommitted.current.toLowerCase()) return;
    const parsed = hexToHsv(parseHex(value) ? value : '#7aa2f7');
    if (parsed) setHsv(parsed);
  }, [value]);

  const hex = hsvToHex(hsv);

  const commitHsv = (next: Hsv): void => {
    setHsv(next);
    const nextHex = hsvToHex(next);
    lastCommitted.current = nextHex;
    onChange(nextHex);
    rememberRecent(nextHex);
    setRecent(readRecent());
  };

  const commitHex = (nextHex: string): void => {
    lastCommitted.current = nextHex;
    const parsed = hexToHsv(nextHex);
    if (parsed) setHsv(parsed);
    onChange(nextHex);
    rememberRecent(nextHex);
    setRecent(readRecent());
  };

  const displayText =
    editingText ??
    (format === 'hex' ? hex : format === 'rgb' ? formatRgb(hsvToRgb(hsv)) : formatHsl(hsvToHsl(hsv)));

  const applyText = (raw: string): void => {
    setEditingText(null);
    const parsedHex =
      format === 'hex'
        ? parseHex(raw)
          ? (raw.startsWith('#') ? raw : `#${raw}`).toLowerCase()
          : null
        : format === 'rgb'
          ? (() => {
              const rgb = parseRgbString(raw);
              return rgb ? toHex(rgb.r, rgb.g, rgb.b) : null;
            })()
          : parseHslString(raw);
    if (parsedHex) commitHex(parsedHex);
  };

  const contrast = showContrastAgainst ? contrastRatio(hex, showContrastAgainst) : null;

  return (
    <div className="color-picker">
      <div className="color-picker__header">
        <ColorSwatch color={hex} label={`Current colour ${hex}`} size={36} />
        <input
          className="input color-picker__text"
          value={displayText}
          onChange={(event) => setEditingText(event.target.value)}
          onFocus={(event) => setEditingText(event.target.value)}
          onBlur={(event) => applyText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') applyText((event.target as HTMLInputElement).value);
          }}
          aria-label={`Colour, as ${format}`}
          spellCheck={false}
        />
        <div className="color-picker__formats" role="group" aria-label="Colour format">
          {(['hex', 'rgb', 'hsl'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`color-picker__format${format === f ? ' color-picker__format--active' : ''}`}
              onClick={() => {
                setFormat(f);
                setEditingText(null);
              }}
              aria-pressed={format === f}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="color-picker__toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />
          <span className="visually-hidden">{open ? 'Fewer options' : 'More colours'}</span>
        </button>
      </div>

      {contrast !== null ? (
        <p className={`color-picker__contrast${contrast < 3 ? ' color-picker__contrast--low' : ''}`}>
          {contrast < 3
            ? 'Hard to read on the background — automatically adjusted a little when applied.'
            : 'Reads clearly on the background.'}
        </p>
      ) : null}

      {open ? (
        <div className="color-picker__panel">
          <SvSquare hsv={hsv} onChange={({ s, v }) => commitHsv({ h: hsv.h, s, v })} />
          <input
            type="range"
            className="color-picker__hue"
            min={0}
            max={360}
            value={Math.round(hsv.h)}
            onChange={(event) => commitHsv({ h: Number(event.target.value), s: hsv.s, v: hsv.v })}
            aria-label="Hue"
          />

          {presets && presets.length > 0 ? (
            <div className="color-picker__row">
              <span className="color-picker__row-label">Presets</span>
              <div className="color-picker__swatches">
                {presets.map((preset) => (
                  <ColorSwatch
                    key={preset.id}
                    color={preset.accent}
                    label={preset.label}
                    selected={preset.accent.toLowerCase() === hex.toLowerCase()}
                    onClick={() => commitHex(preset.accent)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {recent.length > 0 ? (
            <div className="color-picker__row">
              <span className="color-picker__row-label">Recent</span>
              <div className="color-picker__swatches">
                {recent.map((recentHex) => (
                  <ColorSwatch
                    key={recentHex}
                    color={recentHex}
                    label={recentHex}
                    selected={recentHex.toLowerCase() === hex.toLowerCase()}
                    onClick={() => commitHex(recentHex)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
