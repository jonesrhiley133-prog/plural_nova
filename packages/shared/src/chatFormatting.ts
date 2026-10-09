/**
 * A mention token as it's stored inline in a message/post body:
 * `@[u:<userId>]`, `@[m:<memberId>]`, or `@[g:<groupId>]` — a stable id
 * rather than a display name, so a later rename doesn't orphan it.
 */
export const MENTION_TOKEN_PATTERN = /@\[(u|m|g):([a-zA-Z0-9_-]+)\]/g;

export interface MentionToken {
  kind: 'u' | 'm' | 'g';
  id: string;
}

/** Every distinct mention token in a body, in first-seen order. Mentioning the same target twice counts once. */
export function extractMentionTokens(body: string): MentionToken[] {
  const seen = new Set<string>();
  const tokens: MentionToken[] = [];
  for (const match of body.matchAll(MENTION_TOKEN_PATTERN)) {
    const kind = match[1] as 'u' | 'm' | 'g';
    const id = match[2] as string;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push({ kind, id });
  }
  return tokens;
}

/**
 * Turns a formatted chat message into a flat, single-line string — for a
 * conversation list row, a push notification body, or anywhere else a
 * message gets shown without going through the real Markdown renderer.
 *
 * Once a message body can carry colour syntax, spoilers, mentions and
 * formatting markers, a raw `body.slice(0, 120)` would put `%#ff0000%text%%`,
 * `||spoiler||`, a bare `@[m:abc123]` id and stray `**`/`__` characters
 * straight onto a lock screen or a thread list. This strips those markers
 * (keeping the text inside them, except a spoiler's — that stays hidden on
 * purpose, and a mention's — resolving it to a name needs a lookup this pure
 * string function doesn't have) rather than parsing and re-flattening real
 * HTML, since nothing here needs to render.
 */
export function plainTextPreview(body: string): string {
  return body
    .replace(MENTION_TOKEN_PATTERN, '@mention')
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
