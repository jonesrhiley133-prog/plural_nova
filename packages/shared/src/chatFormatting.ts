/**
 * Turns a formatted chat message into a flat, single-line string — for a
 * conversation list row, a push notification body, or anywhere else a
 * message gets shown without going through the real Markdown renderer.
 *
 * Once a message body can carry colour syntax, spoilers and formatting
 * markers, a raw `body.slice(0, 120)` would put `%#ff0000%text%%`,
 * `||spoiler||` and stray `**`/`__` characters straight onto a lock screen
 * or a thread list. This strips those markers (keeping the text inside them,
 * except a spoiler's — that stays hidden on purpose) rather than parsing and
 * re-flattening real HTML, since nothing here needs to render.
 */
export function plainTextPreview(body: string): string {
  return body
    .replace(/%[^%\s]+%([^%]*)%%/g, '$1')
    .replace(/\|\|[^|]*\|\|/g, '[spoiler]')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_([^_]*)_/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
