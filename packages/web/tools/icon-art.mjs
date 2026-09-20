/**
 * The PluralNova mark, described once.
 *
 * A system is more than one person sharing one life, so the mark is a core with
 * orbits crossing it and smaller lights riding those orbits — company, not
 * decoration. Every icon the manifest asks for is derived from this file, which
 * is why there is no folder of hand-drawn SVGs to keep in step with each other.
 */

const FIELD = {
  radial: {
    cx: 195,
    cy: 143,
    r: 420,
    stops: [
      [0, '#16244a'],
      [0.58, '#0a1024'],
      [1, '#05070f'],
    ],
  },
};

const CORE = {
  linear: {
    x1: 123,
    y1: 82,
    x2: 399,
    y2: 451,
    stops: [
      [0, '#a9c6ff'],
      [0.52, '#7aa2f7'],
      [1, '#4f7fe0'],
    ],
  },
};

const INK = '#0a1024';
const ORBIT = '#7aa2f7';
const SPARK = '#8bd5ff';
const BLOOM = '#a78bfa';
const LIGHT = '#e7ecf8';

/** The mark itself, centred at (256, 256) in a 512 user-space box. */
function mark({ orbitRx, orbitRy, orbitWidth, coreR, starlings }) {
  return [
    {
      shape: { kind: 'ellipse', cx: 256, cy: 256, rx: orbitRx, ry: orbitRy, rotate: -26 },
      stroke: ORBIT,
      width: orbitWidth,
      opacity: 0.52,
    },
    {
      shape: { kind: 'ellipse', cx: 256, cy: 256, rx: orbitRx, ry: orbitRy, rotate: 38 },
      stroke: ORBIT,
      width: orbitWidth,
      opacity: 0.3,
    },
    { shape: { kind: 'circle', cx: 256, cy: 256, r: coreR }, fill: CORE },
    {
      shape: { kind: 'circle', cx: 256, cy: 256, r: coreR },
      stroke: '#c7dbff',
      width: 3,
      opacity: 0.5,
    },
    ...starlings,
  ];
}

/** The app icon: rounded, the way a launcher that does not mask will show it. */
export function appIcon() {
  return {
    viewBox: 512,
    ops: [
      { shape: { kind: 'rect', x: 0, y: 0, w: 512, h: 512, r: 112 }, fill: FIELD },
      ...mark({
        orbitRx: 176,
        orbitRy: 78,
        orbitWidth: 10,
        coreR: 58,
        starlings: [
          { shape: { kind: 'circle', cx: 394, cy: 168, r: 19 }, fill: SPARK },
          { shape: { kind: 'circle', cx: 126, cy: 338, r: 13 }, fill: BLOOM, opacity: 0.88 },
          { shape: { kind: 'circle', cx: 340, cy: 372, r: 10 }, fill: ORBIT, opacity: 0.72 },
          { shape: { kind: 'circle', cx: 158, cy: 160, r: 7 }, fill: LIGHT, opacity: 0.6 },
          { shape: { kind: 'circle', cx: 420, cy: 322, r: 5 }, fill: LIGHT, opacity: 0.42 },
          { shape: { kind: 'circle', cx: 92, cy: 216, r: 4 }, fill: LIGHT, opacity: 0.34 },
        ],
      }),
    ],
  };
}

/**
 * The maskable icon: full bleed, with the mark held inside the middle 80% that
 * Android is guaranteed not to crop whatever shape it masks the icon into.
 */
export function maskableIcon() {
  return {
    viewBox: 512,
    ops: [
      { shape: { kind: 'rect', x: 0, y: 0, w: 512, h: 512 }, fill: FIELD },
      ...mark({
        orbitRx: 126,
        orbitRy: 56,
        orbitWidth: 9,
        coreR: 44,
        starlings: [
          { shape: { kind: 'circle', cx: 354, cy: 194, r: 14 }, fill: SPARK },
          { shape: { kind: 'circle', cx: 162, cy: 316, r: 10 }, fill: BLOOM, opacity: 0.85 },
        ],
      }),
    ],
  };
}

/**
 * The Android status-bar badge. The platform throws away the colour and keeps
 * only the alpha, so this is drawn as a solid silhouette — anything relying on
 * hue or a gradient would come out as a white blob.
 */
export function badgeIcon() {
  return {
    viewBox: 96,
    ops: [
      {
        shape: { kind: 'ellipse', cx: 48, cy: 48, rx: 40, ry: 18, rotate: -26 },
        stroke: '#ffffff',
        width: 7,
      },
      {
        shape: { kind: 'ellipse', cx: 48, cy: 48, rx: 40, ry: 18, rotate: 38 },
        stroke: '#ffffff',
        width: 7,
      },
      { shape: { kind: 'circle', cx: 48, cy: 48, r: 15 }, fill: '#ffffff' },
    ],
  };
}

// --------------------------------------------------------------- shortcut tiles

const TILE = { shape: { kind: 'rect', x: 0, y: 0, w: 96, h: 96, r: 22 }, fill: '#0a1024' };

function page(x, y, w, h) {
  return { shape: { kind: 'rect', x, y, w, h, r: 5 }, fill: LIGHT, opacity: 0.92 };
}

function rule(x1, x2, y, opacity = 1) {
  return {
    shape: { kind: 'capsule', x1, y1: y, x2, y2: y, width: 4 },
    stroke: INK,
    width: 4,
    opacity,
  };
}

/**
 * The five launcher shortcuts. Each glyph is built from the same primitives as
 * the app icon, so a shortcut never looks like it came from a different set.
 */
const GLYPHS = {
  // A presence, with the moment radiating out from it.
  front: [
    { shape: { kind: 'circle', cx: 48, cy: 48, r: 17 }, fill: ORBIT },
    ...[
      [48, 12, 48, 21],
      [48, 75, 48, 84],
      [12, 48, 21, 48],
      [75, 48, 84, 48],
    ].map(([x1, y1, x2, y2]) => ({
      shape: { kind: 'capsule', x1, y1, x2, y2, width: 5 },
      stroke: SPARK,
      width: 5,
    })),
  ],

  // A book: two leaves meeting at a spine.
  journal: [
    page(16, 22, 30, 52),
    page(50, 22, 30, 52),
    { shape: { kind: 'capsule', x1: 48, y1: 20, x2: 48, y2: 76, width: 6 }, stroke: ORBIT, width: 6 },
    rule(23, 40, 36, 0.75),
    rule(23, 40, 46, 0.55),
    rule(56, 73, 36, 0.75),
    rule(56, 73, 46, 0.55),
  ],

  // Three readings, rising: a mood is a line, not a verdict.
  mood: [
    {
      shape: { kind: 'capsule', x1: 24, y1: 64, x2: 72, y2: 32, width: 5 },
      stroke: ORBIT,
      width: 5,
      opacity: 0.55,
    },
    { shape: { kind: 'circle', cx: 24, cy: 64, r: 9 }, fill: BLOOM },
    { shape: { kind: 'circle', cx: 48, cy: 48, r: 9 }, fill: ORBIT },
    { shape: { kind: 'circle', cx: 72, cy: 32, r: 9 }, fill: SPARK },
  ],

  // A single sheet with something written on it.
  note: [
    page(22, 18, 52, 60),
    rule(31, 65, 34, 0.8),
    rule(31, 65, 46, 0.6),
    rule(31, 52, 58, 0.45),
  ],

  // A month: the binding rings, the header rule, and the days below it.
  calendar: [
    { shape: { kind: 'capsule', x1: 34, y1: 14, x2: 34, y2: 26, width: 6 }, stroke: SPARK, width: 6 },
    { shape: { kind: 'capsule', x1: 62, y1: 14, x2: 62, y2: 26, width: 6 }, stroke: SPARK, width: 6 },
    { shape: { kind: 'rect', x: 18, y: 22, w: 60, h: 58, r: 10 }, stroke: LIGHT, width: 5, opacity: 0.92 },
    {
      shape: { kind: 'capsule', x1: 21, y1: 38, x2: 75, y2: 38, width: 5 },
      stroke: LIGHT,
      width: 5,
      opacity: 0.92,
    },
    ...[
      [31, 52],
      [48, 52],
      [65, 52],
      [31, 66],
      [48, 66],
    ].map(([cx, cy], index) => ({
      shape: { kind: 'circle', cx, cy, r: 4.5 },
      fill: index === 4 ? SPARK : ORBIT,
      opacity: index === 4 ? 1 : 0.7,
    })),
  ],
};

export const SHORTCUTS = Object.keys(GLYPHS);

export function shortcutIcon(name) {
  const glyph = GLYPHS[name];
  if (!glyph) throw new Error(`unknown shortcut icon: ${name}`);
  return { viewBox: 96, ops: [TILE, ...glyph] };
}
