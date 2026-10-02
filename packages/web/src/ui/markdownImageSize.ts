import type MarkdownIt from 'markdown-it';

// Same `export =` situation as `Markdown.tsx`: the default import only binds
// a value, so `MarkdownIt` cannot be named as a type directly from here.
// `InstanceType<typeof …>` recovers the instance type from the constructor
// without needing an already-built instance lying around to derive it from.
type MarkdownItInstance = InstanceType<typeof MarkdownIt>;

/**
 * markdown-it's own `image` rule, extended with one more thing: an optional
 * `=WxH` / `=Wx` / `=xH` size suffix right before the closing `)` — the same
 * syntax Pandoc and VS Code's own Markdown preview use.
 *
 * This replaces the `markdown-it-imsize` package rather than depending on
 * it. That package's only other feature — reading an image file off local
 * disk with Node's `fs` to fill in a missing size automatically — is
 * Node-only code with no place in a browser bundle, and the unconditional,
 * dynamically-built `require('./types/' + type)` behind it is something
 * Vite's dependency pre-bundler cannot resolve at all, so simply importing
 * the package crashed every page that rendered any Markdown. Nothing here
 * reads a file; a width or height not given in the text is left for CSS.
 */

interface SizeResult {
  ok: boolean;
  width: string;
  height: string;
  pos: number;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function readNumber(src: string, from: number, max: number): { value: string; pos: number } {
  let pos = from;
  while (pos < max) {
    const code = src.charCodeAt(pos);
    if (!isDigit(code) && code !== 0x25 /* % */) break;
    pos += 1;
  }
  return { value: src.slice(from, pos), pos };
}

/** `=300x200`, `=300x` or `=x200`, starting at the `=`. */
function parseSize(src: string, pos: number, max: number): SizeResult {
  const fail: SizeResult = { ok: false, width: '', height: '', pos };
  if (pos >= max || src.charCodeAt(pos) !== 0x3d /* = */) return fail;

  let cursor = pos + 1;
  const firstCode = src.charCodeAt(cursor);
  if (firstCode !== 0x78 /* x */ && !isDigit(firstCode)) return fail;

  const width = readNumber(src, cursor, max);
  cursor = width.pos;
  if (src.charCodeAt(cursor) !== 0x78 /* x */) return fail;
  cursor += 1;
  const height = readNumber(src, cursor, max);

  return { ok: true, width: width.value, height: height.value, pos: height.pos };
}

export function imageWithSize(md: MarkdownItInstance): void {
  md.inline.ruler.before('emphasis', 'image', (state, silent) => {
    const src = state.src;
    const max = state.posMax;
    const oldPos = state.pos;

    if (src.charCodeAt(state.pos) !== 0x21 /* ! */) return false;
    if (src.charCodeAt(state.pos + 1) !== 0x5b /* [ */) return false;

    const labelStart = state.pos + 2;
    const labelEnd = md.helpers.parseLinkLabel(state, state.pos + 1, false);
    if (labelEnd < 0) return false;

    let pos = labelEnd + 1;
    let href = '';
    let title = '';
    let width = '';
    let height = '';

    if (pos < max && src.charCodeAt(pos) === 0x28 /* ( */) {
      pos += 1;
      for (; pos < max; pos += 1) {
        const code = src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) break;
      }
      if (pos >= max) return false;

      const destination = md.helpers.parseLinkDestination(src, pos, max);
      if (destination.ok) {
        href = state.md.normalizeLink(destination.str);
        if (state.md.validateLink(href)) {
          pos = destination.pos;
        } else {
          href = '';
        }
      }

      const beforeTitle = pos;
      for (; pos < max; pos += 1) {
        const code = src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) break;
      }

      const titleResult = md.helpers.parseLinkTitle(src, pos, max);
      if (pos < max && beforeTitle !== pos && titleResult.ok) {
        title = titleResult.str;
        pos = titleResult.pos;
        for (; pos < max; pos += 1) {
          const code = src.charCodeAt(pos);
          if (code !== 0x20 && code !== 0x0a) break;
        }
      }

      // A size suffix needs a space before it, same as a title would.
      if (pos - 1 >= 0 && src.charCodeAt(pos - 1) === 0x20) {
        const size = parseSize(src, pos, max);
        if (size.ok) {
          width = size.width;
          height = size.height;
          pos = size.pos;
          for (; pos < max; pos += 1) {
            const code = src.charCodeAt(pos);
            if (code !== 0x20 && code !== 0x0a) break;
          }
        }
      }

      if (pos >= max || src.charCodeAt(pos) !== 0x29 /* ) */) {
        state.pos = oldPos;
        return false;
      }
      pos += 1;
    } else {
      const env = state.env as { references?: Record<string, { href: string; title: string }> };
      if (!env.references) return false;

      let label = '';
      for (; pos < max; pos += 1) {
        const code = src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) break;
      }
      if (pos < max && src.charCodeAt(pos) === 0x5b /* [ */) {
        const start = pos + 1;
        pos = md.helpers.parseLinkLabel(state, pos);
        if (pos >= 0) {
          label = src.slice(start, pos);
          pos += 1;
        } else {
          pos = labelEnd + 1;
        }
      } else {
        pos = labelEnd + 1;
      }
      if (!label) label = src.slice(labelStart, labelEnd);

      const reference = env.references[md.utils.normalizeReference(label)];
      if (!reference) {
        state.pos = oldPos;
        return false;
      }
      href = reference.href;
      title = reference.title;
    }

    if (!silent) {
      state.pos = labelStart;
      state.posMax = labelEnd;

      const innerState = new state.md.inline.State(src.slice(labelStart, labelEnd), state.md, state.env, []);
      innerState.md.inline.tokenize(innerState);

      const token = state.push('image', 'img', 0);
      token.attrs = [
        ['src', href],
        ['alt', ''],
      ];
      token.children = innerState.tokens;
      if (title) token.attrSet('title', title);
      if (width) token.attrSet('width', width);
      if (height) token.attrSet('height', height);
    }

    state.pos = pos;
    state.posMax = max;
    return true;
  });
}
