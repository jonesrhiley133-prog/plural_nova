import { useMemo, type CSSProperties } from 'react';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import container from 'markdown-it-container';
import DOMPurify from 'dompurify';
import { imageWithSize } from './markdownImageSize.js';
import { colorSyntax } from './markdownColorSyntax.js';
import { spoiler } from './markdownSpoiler.js';

/**
 * Markdown, rendered safely.
 *
 * Two independent defenses, not one: `html: false` means raw HTML typed into
 * the source is escaped rather than parsed, so only the tags this renderer's
 * own rules produce ever become real elements; DOMPurify then sanitizes that
 * output again against an explicit allowlist before it reaches the DOM. A bug
 * in one layer is not enough on its own to run a script from someone else's
 * bio, post or message.
 *
 * `breaks: true` turns a single newline into `<br>` — the custom-field
 * renderer this replaces already did that, and it matches how someone
 * actually types a bio or a post (one line per thought) rather than requiring
 * a blank line between every line the way strict CommonMark does.
 */

// Not annotated as `: MarkdownIt` — the package's `export =` default export
// cannot also be named as a type from here, so every type below is inferred
// from this instance (`typeof md`) rather than named from the package directly.
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})
  // `enabled` left at its default (false, meaning disabled checkboxes): this
  // renders someone else's already-written text, not a live to-do list, so a
  // checkbox that looks clickable but silently forgets the click on the next
  // render would be a lie the UI tells.
  .use(taskLists, { label: true })
  .use(imageWithSize)
  .use(container, 'grid', {
    // `::: grid` / `:::` wraps whatever markdown is between them in a CSS
    // grid — each block inside (a paragraph, an image, …) becomes its own
    // cell automatically, so this needs no per-item syntax of its own.
    //
    // `.use()`'s own type erases every plugin-options argument to `any`
    // (markdown-it's types do not thread a specific plugin's option shape
    // through it), so this is annotated with only the one field actually
    // read rather than fighting that for the real `Token` type.
    render(tokens: { nesting: number }[], idx: number) {
      return tokens[idx]!.nesting === 1 ? '<div class="md-grid">\n' : '</div>\n';
    },
  });

type RenderRule = NonNullable<(typeof md)['renderer']['rules']['link_open']>;

// A markdown link still has to behave like a link to somewhere else — opened
// in a new tab, and never handing the destination a `window.opener` back to
// this one. Applied to both instances below, each independently, since a
// fresh `MarkdownIt()` owns its own `renderer.rules` object.
function openLinksInNewTab(instance: InstanceType<typeof MarkdownIt>): void {
  const defaultLinkOpen: RenderRule =
    instance.renderer.rules['link_open'] ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  instance.renderer.rules['link_open'] = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer nofollow ugc');
    return defaultLinkOpen(tokens, idx, options, env, self);
  };
}
openLinksInNewTab(md);

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'strong', 'em', 's', 'del', 'code', 'pre',
  'ul', 'ol', 'li', 'label',
  'blockquote',
  'a', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'div', 'span', 'input',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel',
  'src', 'alt', 'title', 'width', 'height',
  'class', 'checked', 'disabled', 'type',
  'align',
];

/** The sanitized HTML a `Markdown` component would render, for a caller that needs the string itself (e.g. a preview or a search index). */
export function renderMarkdown(source: string): string {
  const rawHtml = md.render(source);
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

export function Markdown({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return (
    // eslint-disable-next-line react/no-danger -- built through renderMarkdown's two-stage escape+sanitize, not raw user input
    <div
      className={`markdown-body${className ? ` ${className}` : ''}`}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * A second, independent `MarkdownIt` instance for chat — its own copy
 * rather than conditionally mutating the one bios/posts/journal entries
 * already rely on, since its behaviour genuinely differs from theirs in
 * ways that would otherwise collide:
 *
 *   - Images are disabled outright. A remote `<img>` in a chat message
 *     would let any sender log the reader's IP and exact read time on
 *     every open of a conversation — bios and posts carry the same image
 *     but are fetched once per view, not once per message.
 *   - `__text__` renders as underline, not CommonMark's bold, matching the
 *     "Discord-style" convention explicitly rather than silently colliding
 *     with the `**bold**`/`__bold__` dual syntax posts already rely on.
 *   - Colour spans and spoilers are chat-only syntax with no bio/post
 *     equivalent.
 */
// markdown-it's own `text` rule stops only at a fixed set of characters it
// treats as terminators, consuming every other run of plain text in one
// gulp — including straight past a second `|` later in the same run,
// since that rule has no way to know a sibling rule wants a turn there.
// `%` is already one of those terminators (confirmed by direct probing of
// markdown-it's own rule-visit order, not assumed), which is the only
// reason `colorSyntax` works at all without this; `|` is not. Rather than
// patching or depending on markdown-it's own `text` rule internals — not
// part of its public API, and not reachable through its package exports —
// this reimplements that rule's exact stopping behaviour (the same
// terminator set, independently confirmed character-by-character against
// the installed version) with one addition, registered before `text` so
// it always gets first refusal and `text` itself never actually runs for
// chat.
const TEXT_TERMINATORS = new Set(
  ['!', '#', '$', '%', '&', '*', '+', '-', ':', '<', '=', '>', '@', '[', '\\', ']', '^', '_', '`', '{', '}', '~', '|'].map(
    (ch) => ch.charCodeAt(0),
  ),
);
function haltTextAtChatDelimiters(md: InstanceType<typeof MarkdownIt>): void {
  md.inline.ruler.before('text', 'pluralnova_text_boundary', (state, silent) => {
    const src = state.src;
    const max = state.posMax;
    const start = state.pos;
    if (TEXT_TERMINATORS.has(src.charCodeAt(start))) return false;
    let pos = start;
    while (pos < max && !TEXT_TERMINATORS.has(src.charCodeAt(pos))) pos += 1;
    if (pos === start) return false;
    if (!silent) state.pending += src.slice(start, pos);
    state.pos = pos;
    return true;
  });
}

const chatMd = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
})
  .disable('image')
  .use(haltTextAtChatDelimiters)
  .use(colorSyntax)
  .use(spoiler);
openLinksInNewTab(chatMd);

const defaultStrongOpen: RenderRule =
  chatMd.renderer.rules['strong_open'] ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
const defaultStrongClose: RenderRule =
  chatMd.renderer.rules['strong_close'] ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
chatMd.renderer.rules['strong_open'] = (tokens, idx, options, env, self) =>
  tokens[idx]!.markup === '__' ? '<u>' : defaultStrongOpen(tokens, idx, options, env, self);
chatMd.renderer.rules['strong_close'] = (tokens, idx, options, env, self) =>
  tokens[idx]!.markup === '__' ? '</u>' : defaultStrongClose(tokens, idx, options, env, self);

const CHAT_ALLOWED_TAGS = ALLOWED_TAGS.filter((tag) => tag !== 'img').concat('u');
const CHAT_ALLOWED_ATTR = ALLOWED_ATTR.filter((attr) => attr !== 'src' && attr !== 'width' && attr !== 'height').concat(
  // `style` only ever carries a `color:` declaration this module's own
  // `pluralnova_color` rule already validated (see markdownColorSyntax.ts)
  // — DOMPurify screens the attribute value for dangerous content, not
  // which CSS properties it sets, so the safety is this closed pipeline
  // never emitting anything else into it, not DOMPurify restricting it.
  ['style', 'role', 'tabindex', 'aria-label'],
);

/** The sanitized HTML a `ChatMarkdown` would render, for a caller that needs the string itself (a plain-text preview, a search index). */
export function renderChatMarkdown(source: string): string {
  const rawHtml = chatMd.render(source);
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: CHAT_ALLOWED_TAGS,
    ALLOWED_ATTR: CHAT_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}

/** A spoiler span only ever toggles its own revealed state — never a parent's, never more than the one that was activated. */
function toggleSpoiler(target: EventTarget | null): void {
  const spoilerEl = target instanceof Element ? target.closest('.md-spoiler') : null;
  spoilerEl?.classList.toggle('md-spoiler--revealed');
}

/**
 * Chat's own renderer: same safe two-stage render as `Markdown`, plus a
 * delegated click/keyboard handler for `.md-spoiler` spans — inert markup
 * once sanitized, since `dangerouslySetInnerHTML` carries no React event
 * handlers of its own.
 */
export function ChatMarkdown({ text, className }: { text: string; className?: string }): JSX.Element {
  const html = useMemo(() => renderChatMarkdown(text), [text]);
  return (
    // eslint-disable-next-line react/no-danger -- built through renderChatMarkdown's two-stage escape+sanitize, not raw user input
    <div
      className={`markdown-body chat-markdown${className ? ` ${className}` : ''}`}
      onClick={(event) => toggleSpoiler(event.target)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') toggleSpoiler(event.target);
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
