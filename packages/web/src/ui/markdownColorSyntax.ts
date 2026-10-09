import type MarkdownIt from 'markdown-it';
import { resolveColorSpec } from '@pluralnova/shared';

// Same `export =` situation as `markdownImageSize.ts`: the default import
// only binds a value, so `MarkdownIt` cannot be named as a type directly.
type MarkdownItInstance = InstanceType<typeof MarkdownIt>;

/**
 * `%<spec>%<text>%%` — a coloured span, where `<spec>` is a hex code, a
 * curated colour name, or `hex/name` together (`resolveColorSpec` handles
 * the "hex first, name as fallback" rule, including a bare name with no
 * slash at all). Falls through to plain text on anything that doesn't
 * fully match — an unmatched colour spec, no closing `%%`, or a spec that
 * resolves to nothing real — the same convention `imageWithSize` already
 * follows, so an ordinary `%` in a sentence is never affected.
 *
 * The inner text is parsed through `inline.parse` (not `inline.tokenize` —
 * that alone only marks emphasis delimiters, it never actually pairs them
 * into real `strong`/`em` tokens, since that pairing is a second pass
 * `parse` also runs but a bare `tokenize` does not) and the resulting
 * tokens spliced directly into the outer stream between an open/close
 * pair, so nested bold/italic/etc. inside the colour really render.
 *
 * Registered before `text`, not merely before `emphasis`: markdown-it's
 * `text` rule only stops at a fixed set of characters it treats as
 * terminators, and `%` is one of them, which is what makes a rule
 * registered right before `emphasis` reachable at all here — but relying
 * on that is fragile, so this is explicit about running before `text`
 * itself instead, the same way the spoiler rule below has to be for `|`,
 * which is not in that set.
 */
export function colorSyntax(md: MarkdownItInstance): void {
  md.inline.ruler.before('text', 'pluralnova_color', (state, silent) => {
    const src = state.src;
    const max = state.posMax;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x25 /* % */) return false;

    const specEnd = src.indexOf('%', start + 1);
    if (specEnd === -1 || specEnd >= max || specEnd === start + 1) return false;
    const spec = src.slice(start + 1, specEnd);
    if (/[\s%]/.test(spec)) return false;

    const closeStart = src.indexOf('%%', specEnd + 1);
    if (closeStart === -1 || closeStart >= max || closeStart === specEnd + 1) return false;
    const innerText = src.slice(specEnd + 1, closeStart);
    if (innerText.includes('\n')) return false;

    const color = resolveColorSpec(spec);
    if (!color) return false;

    if (!silent) {
      const open = state.push('pluralnova_color_open', 'span', 1);
      open.attrSet('style', `color:${color}`);

      state.md.inline.parse(innerText, state.md, state.env, state.tokens);

      state.push('pluralnova_color_close', 'span', -1);
    }

    state.pos = closeStart + 2;
    return true;
  });
}
