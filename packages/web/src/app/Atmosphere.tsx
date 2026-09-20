import { useEffect, useMemo, useRef } from 'react';
import { useTheme } from '../core/theme.js';

/**
 * The background.
 *
 * A static starfield painted once to a canvas, plus two faint orbital rings.
 * It is drawn once per size change rather than animated, so it costs nothing to
 * keep on screen, and it is skipped entirely when the effect tier or the user's
 * settings say to leave it out.
 */

interface Star {
  x: number;
  y: number;
  radius: number;
  alpha: number;
}

function generateStars(width: number, height: number, seed: number): Star[] {
  // Density scaled to area so a desktop is not sparse and a phone is not noisy.
  const count = Math.min(220, Math.round((width * height) / 9000));
  const stars: Star[] = [];
  let state = seed;
  const random = (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  for (let index = 0; index < count; index += 1) {
    stars.push({
      x: random() * width,
      y: random() * height,
      radius: random() * 1.1 + 0.25,
      alpha: random() * 0.55 + 0.12,
    });
  }
  return stars;
}

export function Atmosphere(): JSX.Element | null {
  const { settings, tokens } = useTheme();
  const canvas = useRef<HTMLCanvasElement>(null);

  const show = settings.showStarfield && settings.effects !== 'performance';

  useEffect(() => {
    if (!show) return;
    const element = canvas.current;
    if (!element) return;

    const draw = (): void => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;
      element.width = width * ratio;
      element.height = height * ratio;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;

      const context = element.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, width, height);

      for (const star of generateStars(width, height, 20240137)) {
        context.beginPath();
        context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(233, 240, 255, ${star.alpha})`;
        context.fill();
      }
    };

    draw();
    let timer: number;
    const onResize = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 180);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, [show, tokens.bg]);

  const rings = useMemo(
    () => [
      { size: '78vmax', top: '-30vmax', left: '-18vmax' },
      { size: '52vmax', top: '35vmax', left: '55vmax' },
    ],
    [],
  );

  return (
    <div className="atmosphere" aria-hidden="true">
      {show ? <canvas ref={canvas} className="atmosphere__stars" /> : null}
      {settings.effects === 'full'
        ? rings.map((ring, index) => (
            <span
              key={index}
              className="atmosphere__orbit"
              style={{ width: ring.size, height: ring.size, top: ring.top, left: ring.left }}
            />
          ))
        : null}
    </div>
  );
}

/** The wordmark: a small orbital glyph that picks up the accent colour. */
export function Logo({ size = 28 }: { size?: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <ellipse
        cx="16"
        cy="16"
        rx="14"
        ry="6.2"
        transform="rotate(-24 16 16)"
        stroke="var(--accent)"
        strokeWidth="1.3"
        opacity="0.55"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="14"
        ry="6.2"
        transform="rotate(38 16 16)"
        stroke="var(--accent)"
        strokeWidth="1.3"
        opacity="0.3"
      />
      <circle cx="16" cy="16" r="4.4" fill="var(--accent)" />
      <circle cx="27" cy="9.6" r="1.6" fill="var(--accent)" opacity="0.8" />
      <circle cx="5.4" cy="21.5" r="1.1" fill="var(--accent)" opacity="0.55" />
    </svg>
  );
}
