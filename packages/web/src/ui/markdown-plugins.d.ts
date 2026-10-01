/**
 * This plugin ships no types of its own and has no published `@types`
 * package. Typed only as far as this app actually calls it — a plain
 * `markdown-it` plugin function taking optional options.
 *
 * (There used to be a second declaration here, for `markdown-it-imsize` —
 * removed along with the package itself. See `markdownImageSize.ts` for why.)
 */

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  function taskLists(md: MarkdownIt, options?: TaskListsOptions): void;
  export default taskLists;
}
