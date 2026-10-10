import type MarkdownIt from 'markdown-it';

type MarkdownItInstance = InstanceType<typeof MarkdownIt>;

/**
 * `||text||` — a click-to-reveal spoiler span, following the exact same
 * shape as `markdownColorSyntax`'s `pluralnova_color` rule (scan ahead for
 * an unambiguous close marker before committing to anything, parse the
 * inner text through `inline.parse` so nested formatting still renders,
 * fall through to plain text on any non-match). The reveal itself is
 * handled by a delegated click listener on the rendered container, since
 * this markup is inert HTML once sanitized — see `ChatMarkdown` in
 * `Markdown.tsx`.
 *
 * Registered before `text`, not `emphasis`: `|` is not one of the fixed
 * characters markdown-it's own `text` rule treats as a terminator, so
 * without this, `text` would already have consumed straight through
 * `||...||` before this rule ever got a turn at the opening `|`.
 */
export function spoiler(md: MarkdownItInstance): void {
  md.inline.ruler.before('text', 'pluralnova_spoiler', (state, silent) => {
    const src = state.src;
    const max = state.posMax;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x7c /* | */ || src.charCodeAt(start + 1) !== 0x7c) return false;

    const closeStart = src.indexOf('||', start + 2);
    if (closeStart === -1 || closeStart >= max || closeStart === start + 2) return false;
    const innerText = src.slice(start + 2, closeStart);
    if (innerText.includes('\n')) return false;

    if (!silent) {
      const open = state.push('pluralnova_spoiler_open', 'span', 1);
      open.attrSet('class', 'md-spoiler');
      open.attrSet('role', 'button');
      open.attrSet('tabindex', '0');
      open.attrSet('aria-label', 'Spoiler. Activate to reveal.');

      state.md.inline.parse(innerText, state.md, state.env, state.tokens);

      state.push('pluralnova_spoiler_close', 'span', -1);
    }

    state.pos = closeStart + 2;
    return true;
  });
}
