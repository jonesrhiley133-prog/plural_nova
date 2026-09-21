/**
 * A very small vector rasteriser and PNG writer.
 *
 * PluralNova's icons are a dozen circles, ellipses, rounded rectangles and
 * capsules, and every one of those has a closed-form signed distance function.
 * Evaluating those directly produces antialiased bitmaps without adding a
 * rendering library — or a headless browser — to the build. The same shape list
 * also emits SVG (see `toSvg`), so the vector and bitmap icons cannot drift.
 *
 * Coordinates are given in the artwork's own user space; `render` scales them to
 * whatever pixel size is asked for.
 */

import { deflateSync, crc32 } from 'node:zlib';

// ---------------------------------------------------------------------- colour

function parseHex(hex) {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

/** Interpolates a gradient's stops in sRGB, which is what SVG does by default. */
function mixStops(stops, t) {
  if (t <= stops[0][0]) return parseHex(stops[0][1]);
  const last = stops[stops.length - 1];
  if (t >= last[0]) return parseHex(last[1]);
  for (let i = 1; i < stops.length; i += 1) {
    const [fromOffset, fromColour] = stops[i - 1];
    const [toOffset, toColour] = stops[i];
    if (t > toOffset) continue;
    const span = toOffset - fromOffset;
    const k = span === 0 ? 0 : (t - fromOffset) / span;
    const a = parseHex(fromColour);
    const b = parseHex(toColour);
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  }
  return parseHex(last[1]);
}

function samplePaint(paint, x, y) {
  if (typeof paint === 'string') return parseHex(paint);
  if (paint.radial) {
    const g = paint.radial;
    return mixStops(g.stops, Math.hypot(x - g.cx, y - g.cy) / g.r);
  }
  const g = paint.linear;
  const dx = g.x2 - g.x1;
  const dy = g.y2 - g.y1;
  const len2 = dx * dx + dy * dy;
  return mixStops(g.stops, len2 === 0 ? 0 : ((x - g.x1) * dx + (y - g.y1) * dy) / len2);
}

// -------------------------------------------------------------------- geometry

/** Signed distance to a shape's boundary: negative inside, positive outside. */
function distance(shape, x, y) {
  switch (shape.kind) {
    case 'rect': {
      const halfW = shape.w / 2;
      const halfH = shape.h / 2;
      const radius = Math.min(shape.r ?? 0, halfW, halfH);
      const px = Math.abs(x - (shape.x + halfW)) - (halfW - radius);
      const py = Math.abs(y - (shape.y + halfH)) - (halfH - radius);
      const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0));
      return outside + Math.min(Math.max(px, py), 0) - radius;
    }
    case 'circle':
      return Math.hypot(x - shape.cx, y - shape.cy) - shape.r;
    case 'ellipse': {
      // First-order distance from the implicit form, f / |grad f|. An exact
      // ellipse distance needs an iterative solve; at these aspect ratios the
      // approximation is well under a pixel, which is all antialiasing needs.
      const angle = ((shape.rotate ?? 0) * Math.PI) / 180;
      const dx = x - shape.cx;
      const dy = y - shape.cy;
      const px = dx * Math.cos(angle) + dy * Math.sin(angle);
      const py = -dx * Math.sin(angle) + dy * Math.cos(angle);
      const rx2 = shape.rx * shape.rx;
      const ry2 = shape.ry * shape.ry;
      const f = (px * px) / rx2 + (py * py) / ry2 - 1;
      const gradient = Math.hypot((2 * px) / rx2, (2 * py) / ry2);
      return gradient === 0 ? -Math.min(shape.rx, shape.ry) : f / gradient;
    }
    case 'capsule': {
      const dx = shape.x2 - shape.x1;
      const dy = shape.y2 - shape.y1;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 === 0
          ? 0
          : Math.max(0, Math.min(1, ((x - shape.x1) * dx + (y - shape.y1) * dy) / len2));
      return Math.hypot(x - (shape.x1 + dx * t), y - (shape.y1 + dy * t)) - shape.width / 2;
    }
    default:
      throw new Error(`unknown shape: ${shape.kind}`);
  }
}

/** The region an op can touch, in user space, padded for antialiasing. */
function bounds(op) {
  const grow = (op.width ?? 0) / 2 + 2;
  const s = op.shape;
  switch (s.kind) {
    case 'rect':
      return [s.x - grow, s.y - grow, s.x + s.w + grow, s.y + s.h + grow];
    case 'circle':
      return [s.cx - s.r - grow, s.cy - s.r - grow, s.cx + s.r + grow, s.cy + s.r + grow];
    case 'ellipse': {
      // Rotation is unknown to the caller here, so use the larger radius both ways.
      const r = Math.max(s.rx, s.ry) + grow;
      return [s.cx - r, s.cy - r, s.cx + r, s.cy + r];
    }
    case 'capsule': {
      const r = s.width / 2 + grow;
      return [
        Math.min(s.x1, s.x2) - r,
        Math.min(s.y1, s.y2) - r,
        Math.max(s.x1, s.x2) + r,
        Math.max(s.y1, s.y2) + r,
      ];
    }
    default:
      throw new Error(`unknown shape: ${s.kind}`);
  }
}

// ------------------------------------------------------------------- rendering

/**
 * Draws an artwork at `size` square pixels and returns straight-alpha RGBA bytes.
 *
 * @param {{ viewBox: number, ops: object[] }} art
 * @param {number} size
 */
export function render(art, size) {
  const scale = size / art.viewBox;
  const rgba = new Float64Array(size * size * 4);

  for (const op of art.ops) {
    const [minX, minY, maxX, maxY] = bounds(op);
    const x0 = Math.max(0, Math.floor(minX * scale));
    const y0 = Math.max(0, Math.floor(minY * scale));
    const x1 = Math.min(size - 1, Math.ceil(maxX * scale));
    const y1 = Math.min(size - 1, Math.ceil(maxY * scale));
    const paint = op.fill ?? op.stroke;
    const alpha = op.opacity ?? 1;

    for (let py = y0; py <= y1; py += 1) {
      const uy = (py + 0.5) / scale;
      for (let px = x0; px <= x1; px += 1) {
        const ux = (px + 0.5) / scale;
        let d = distance(op.shape, ux, uy);
        if (op.stroke) d = Math.abs(d) - op.width / 2;
        // Coverage straight off the distance field: one sample per pixel, with
        // the edge softened across exactly one pixel.
        const coverage = Math.min(1, Math.max(0, 0.5 - d * scale));
        if (coverage <= 0) continue;

        const a = coverage * alpha;
        const [r, g, b] = samplePaint(paint, ux, uy);
        const i = (py * size + px) * 4;
        const dstA = rgba[i + 3];
        const outA = a + dstA * (1 - a);
        if (outA <= 0) continue;
        rgba[i] = (r * a + rgba[i] * dstA * (1 - a)) / outA;
        rgba[i + 1] = (g * a + rgba[i + 1] * dstA * (1 - a)) / outA;
        rgba[i + 2] = (b * a + rgba[i + 2] * dstA * (1 - a)) / outA;
        rgba[i + 3] = outA;
      }
    }
  }

  const bytes = Buffer.alloc(size * size * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    bytes[i] = Math.round(Math.min(255, Math.max(0, rgba[i])));
    bytes[i + 1] = Math.round(Math.min(255, Math.max(0, rgba[i + 1])));
    bytes[i + 2] = Math.round(Math.min(255, Math.max(0, rgba[i + 2])));
    bytes[i + 3] = Math.round(Math.min(255, Math.max(0, rgba[i + 3] * 255)));
  }
  return bytes;
}

// ------------------------------------------------------------------------- PNG

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])) >>> 0, 0);
  return Buffer.concat([head, data, tail]);
}

/** Encodes straight-alpha RGBA bytes as a PNG (colour type 6, no filtering). */
export function toPng(bytes, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  // 10..12 stay zero: deflate compression, adaptive filtering, no interlace.

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type "none"
    bytes.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------------- SVG

function paintRef(paint, defs) {
  if (typeof paint === 'string') return paint;
  const id = `g${defs.length}`;
  const stops = (paint.radial ?? paint.linear).stops
    .map(([offset, colour]) => `<stop offset="${+(offset * 100).toFixed(2)}%" stop-color="${colour}"/>`)
    .join('');
  if (paint.radial) {
    const g = paint.radial;
    defs.push(
      `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${g.cx}" cy="${g.cy}" r="${g.r}">${stops}</radialGradient>`,
    );
  } else {
    const g = paint.linear;
    defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient>`,
    );
  }
  return `url(#${id})`;
}

function element(op, defs) {
  const s = op.shape;
  const attrs = [];
  if (op.fill) attrs.push(`fill="${paintRef(op.fill, defs)}"`);
  else attrs.push('fill="none"');
  if (op.stroke) {
    attrs.push(`stroke="${paintRef(op.stroke, defs)}"`, `stroke-width="${op.width}"`);
  }
  if (op.opacity !== undefined && op.opacity !== 1) attrs.push(`opacity="${op.opacity}"`);
  const tail = attrs.join(' ');

  switch (s.kind) {
    case 'rect':
      return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${s.r ? ` rx="${s.r}"` : ''} ${tail}/>`;
    case 'circle':
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" ${tail}/>`;
    case 'ellipse': {
      const spin = s.rotate ? ` transform="rotate(${s.rotate} ${s.cx} ${s.cy})"` : '';
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${spin} ${tail}/>`;
    }
    case 'capsule':
      return `<path d="M${s.x1} ${s.y1}L${s.x2} ${s.y2}" stroke-linecap="round" ${tail}/>`;
    default:
      throw new Error(`unknown shape: ${s.kind}`);
  }
}

/** Renders the same artwork as SVG, so the vector and bitmap icons agree. */
export function toSvg(art, label) {
  const defs = [];
  const body = art.ops.map((op) => element(op, defs)).join('\n  ');
  const box = art.viewBox;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" role="img" aria-label="${label}">`,
    defs.length ? `  <defs>${defs.join('')}</defs>` : null,
    `  ${body}`,
    '</svg>',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}
