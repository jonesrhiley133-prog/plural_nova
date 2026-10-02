import { useMemo, type CSSProperties } from 'react';
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import container from 'markdown-it-container';
import DOMPurify from 'dompurify';
import { imageWithSize } from './markdownImageSize.js';

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
// this one.
const defaultLinkOpen: RenderRule =
  md.renderer.rules['link_open'] ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules['link_open'] = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!;
  token.attrSet('target', '_blank');
  token.attrSet('rel', 'noopener noreferrer nofollow ugc');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

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
