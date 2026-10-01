import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown, renderMarkdown } from '../Markdown.js';

/**
 * `renderMarkdown` carries two independent defenses — markdown-it parsing
 * with `html: false`, then a DOMPurify allowlist pass — so these tests lean
 * on the attack cases at least as much as the formatting cases: a formatting
 * regression is visible the moment someone looks at a bio, but a sanitizer
 * regression is not.
 */

describe('renderMarkdown — formatting', () => {
  it('renders headers, emphasis, and strikethrough', () => {
    const html = renderMarkdown('# Title\n\n**bold** and *italic* and ~~gone~~');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
    expect(html).toContain('<s>gone</s>');
  });

  it('renders an unordered list', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  it('renders a blockquote', () => {
    const html = renderMarkdown('> a quote');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('a quote');
  });

  it('turns a single newline into a line break', () => {
    const html = renderMarkdown('line one\nline two');
    expect(html).toContain('<br>');
  });

  it('renders a link that opens in a new tab without handing it window.opener', () => {
    const html = renderMarkdown('[a link](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
  });

  it('renders a table', () => {
    const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>a</th>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders a checklist with an unchecked and a checked item', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done');
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/checked(="")?[ >]/);
  });

  it('applies width and height from the image-sizing syntax', () => {
    const html = renderMarkdown('![a photo](https://example.com/pic.png =300x200)');
    expect(html).toContain('src="https://example.com/pic.png"');
    expect(html).toContain('alt="a photo"');
    expect(html).toContain('width="300"');
    expect(html).toContain('height="200"');
  });

  it('wraps a ::: grid container in a .md-grid div', () => {
    const html = renderMarkdown('::: grid\none\n\ntwo\n:::');
    expect(html).toContain('<div class="md-grid">');
  });
});

/**
 * These check the actual DOM-level safety property — no live script element,
 * no live javascript: href, no live event-handler attribute — rather than
 * the HTML string's exact text. Which of the two layers (markdown-it's
 * `html:false` escape, its own link-scheme validation, or the DOMPurify
 * allowlist) stopped a given case can shift as the engine evolves; a raw
 * `<script>` typed into a bio showing up as harmless escaped *text* is
 * correct behavior, not a test failure, so string-matching for the
 * substring would have been the wrong check.
 */
function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('renderMarkdown — sanitization', () => {
  it('never lets a raw script tag in the source become a real element', () => {
    const doc = parseHtml(renderMarkdown('before\n\n<script>alert(1)</script>\n\nafter'));
    expect(doc.querySelectorAll('script')).toHaveLength(0);
  });

  it('never produces a live javascript: link href', () => {
    const doc = parseHtml(renderMarkdown('[click me](javascript:alert(1))'));
    const hrefs = Array.from(doc.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((href) => href.toLowerCase().startsWith('javascript:'))).toBe(false);
  });

  it('never lets an inline event-handler attribute survive on a real element', () => {
    const doc = parseHtml(renderMarkdown('<img src="x" onerror="alert(1)">\n\n![real](https://example.com/a.png)'));
    const liveAttrNames = Array.from(doc.querySelectorAll('*')).flatMap((el) =>
      Array.from(el.attributes).map((attr) => attr.name.toLowerCase())
    );
    expect(liveAttrNames.some((name) => name.startsWith('on'))).toBe(false);
  });

  it('drops a raw iframe typed directly into the source', () => {
    const doc = parseHtml(renderMarkdown('<iframe src="https://evil.example/"></iframe>'));
    expect(doc.querySelectorAll('iframe')).toHaveLength(0);
  });
});

describe('Markdown component', () => {
  it('renders sanitized HTML inside a .markdown-body wrapper', () => {
    const { container } = render(<Markdown text="**hi**" />);
    const wrapper = container.querySelector('.markdown-body');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.innerHTML).toContain('<strong>hi</strong>');
  });

  it('appends a caller-provided className alongside markdown-body', () => {
    const { container } = render(<Markdown text="hi" className="bio" />);
    expect(container.querySelector('.markdown-body.bio')).not.toBeNull();
  });
});
