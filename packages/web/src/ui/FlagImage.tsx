import { useState } from 'react';
import { Icon } from './Icon.js';

export interface FlagImageItem {
  id?: string;
  name: string;
  imageUrl?: string | null;
  color?: string | null;
  icon?: string | null;
}

/**
 * A flag, rendered as an actual rectangular image — never just its name as
 * text, a colour swatch standing in for one, or an emoji substitute. Falls
 * back to the flag's own colour and icon (the same fallback shape
 * `Flags.tsx` already draws for its own grid) when there's no image, or the
 * image fails to load — a broken `imageUrl` must never show broken UI.
 */
export function FlagImage({
  flag,
  width = 40,
  className,
}: {
  flag: FlagImageItem;
  width?: number;
  className?: string;
}): JSX.Element {
  const [broken, setBroken] = useState(false);
  const color = flag.color || 'var(--accent)';
  const showImage = Boolean(flag.imageUrl) && !broken;

  return (
    <span
      className={`flag-image${className ? ` ${className}` : ''}`}
      style={{ ['--flag-width' as never]: `${width}px` }}
      title={flag.name}
    >
      {showImage ? (
        <img src={flag.imageUrl as string} alt={flag.name} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span className="flag-image__fallback" style={{ ['--flag-color' as never]: color, color }} aria-hidden="true">
          {flag.icon ? flag.icon : <Icon name="flag" size={Math.round(width * 0.4)} />}
        </span>
      )}
    </span>
  );
}

/** One or more flags, each its own fixed-ratio image, in their stored order. */
export function FlagImageRow({
  flags,
  width = 40,
  className,
}: {
  flags: FlagImageItem[];
  width?: number;
  className?: string;
}): JSX.Element | null {
  if (flags.length === 0) return null;
  return (
    <span className={`flag-image-row${className ? ` ${className}` : ''}`}>
      {flags.map((flag, index) => (
        <FlagImage key={flag.id ?? index} flag={flag} width={width} />
      ))}
    </span>
  );
}
