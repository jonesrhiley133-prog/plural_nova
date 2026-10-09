import type MarkdownIt from 'markdown-it';

type MarkdownItInstance = InstanceType<typeof MarkdownIt>;

/** One resolved mention target, keyed `${kind}:${id}` in `env.mentions` — see `Markdown.tsx`. */
export interface MentionResolution {
  name: string;
}

const TOKEN = /^@\[(u|m|g):([a-zA-Z0-9_-]+)\]/;

/**
 * `@[u:<userId>]` / `@[m:<memberId>]` / `@[g:<groupId>]` → a `<span class="md-mention">@Name</span>`,
 * the name looked up from `env.mentions` (an id→name map the caller builds once per render, since
 * resolving an id needs data this plugin itself has no access to). An id missing from that map —
 * a stranger's id a client was never sent a name for, or something since deleted — falls through
 * to plain text rather than erroring, same as an invalid colour spec or an unterminated spoiler.
 *
 * `@` is already one of markdown-it's own fixed `text`-rule terminators, so — unlike `|` for
 * spoilers — this doesn't need the chat-only `haltTextAtChatDelimiters` rule to fire reliably on
 * a second mention in the same message; it works the same on the shared base instance (bios,
 * posts) as on the chat one.
 */
export function mentions(md: MarkdownItInstance): void {
  md.inline.ruler.before('text', 'pluralnova_mention', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x40 /* @ */) return false;
    const match = TOKEN.exec(state.src.slice(state.pos));
    if (!match) return false;

    const kind = match[1] as string;
    const id = match[2] as string;
    const map = (state.env as { mentions?: Record<string, MentionResolution> } | undefined)?.mentions;
    const resolved = map?.[`${kind}:${id}`];
    if (!resolved) return false;

    if (!silent) {
      const open = state.push('pluralnova_mention_open', 'span', 1);
      open.attrSet('class', 'md-mention');
      const text = state.push('text', '', 0);
      text.content = `@${resolved.name}`;
      state.push('pluralnova_mention_close', 'span', -1);
    }

    state.pos += match[0].length;
    return true;
  });
}
