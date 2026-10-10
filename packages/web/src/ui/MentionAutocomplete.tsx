import { useCallback, useRef, useState } from 'react';
import { searchMentions, type MentionCandidates } from '../core/mentions.js';
import { Avatar } from './primitives.js';

/**
 * The `@` autocomplete shown while typing in a composer with the selection
 * APIs to support it (see `ChatComposer.tsx`). A hook owning the search +
 * highlighted-index state, paired with a plain list component — the same
 * split as `useActionMenu`/`ActionMenu` in `overlays.tsx` — so a composer's
 * own keydown handler can drive the highlight (arrows, Enter, Escape)
 * without the list needing to know about keyboard events at all.
 */

export interface MentionCandidate {
  kind: 'u' | 'm' | 'g';
  id: string;
  name: string;
  avatarUrl?: string | null;
  color?: string | null;
  icon?: string | null;
}

/**
 * Whether the cursor sits right after an in-progress `@query` — i.e. an `@`
 * at the start of the text or right after whitespace, with nothing but word
 * characters between it and the cursor. Shared by every plain-textarea
 * composer that wants `@`-triggered autocomplete, so the "where does the
 * mention start" arithmetic exists exactly once.
 */
export function mentionQueryBefore(text: string, cursor: number): { query: string; atIndex: number } | null {
  const match = /(?:^|\s)@(\w{0,32})$/.exec(text.slice(0, cursor));
  if (!match) return null;
  const query = match[1] ?? '';
  return { query, atIndex: cursor - query.length - 1 };
}

function flatten(data: MentionCandidates): MentionCandidate[] {
  return [
    ...data.users.map((u) => ({ kind: 'u' as const, id: u.userId, name: u.displayName, avatarUrl: u.avatarUrl })),
    ...data.members.map((m) => ({ kind: 'm' as const, id: m.id, name: m.name, avatarUrl: m.avatarUrl, color: m.color, icon: m.icon })),
    ...data.groups.map((g) => ({ kind: 'g' as const, id: g.id, name: g.name, color: g.color, icon: g.icon })),
  ];
}

export interface MentionAutocompleteState {
  open: boolean;
  results: MentionCandidate[];
  highlightedIndex: number;
}

export interface MentionAutocompleteController extends MentionAutocompleteState {
  search: (query: string) => void;
  close: () => void;
  moveHighlight: (delta: number) => void;
  pickHighlighted: () => MentionCandidate | null;
}

const CLOSED: MentionAutocompleteState = { open: false, results: [], highlightedIndex: 0 };

export function useMentionAutocomplete(): MentionAutocompleteController {
  const [state, setState] = useState<MentionAutocompleteState>(CLOSED);
  // Both guard the same race — a slow response for a query the caller has
  // since replaced or closed must never overwrite newer state.
  const requestId = useRef(0);
  const debounceTimer = useRef<number | null>(null);

  const search = useCallback((query: string) => {
    const id = ++requestId.current;
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
    if (!query) {
      setState({ open: true, results: [], highlightedIndex: 0 });
      return;
    }
    debounceTimer.current = window.setTimeout(() => {
      void searchMentions(query)
        .then((data) => {
          if (requestId.current === id) setState({ open: true, results: flatten(data), highlightedIndex: 0 });
        })
        .catch(() => {
          if (requestId.current === id) setState({ open: true, results: [], highlightedIndex: 0 });
        });
    }, 150);
  }, []);

  const close = useCallback(() => {
    requestId.current += 1;
    if (debounceTimer.current !== null) window.clearTimeout(debounceTimer.current);
    setState(CLOSED);
  }, []);

  const moveHighlight = useCallback((delta: number) => {
    setState((current) => {
      if (current.results.length === 0) return current;
      const next = (current.highlightedIndex + delta + current.results.length) % current.results.length;
      return { ...current, highlightedIndex: next };
    });
  }, []);

  const pickHighlighted = useCallback((): MentionCandidate | null => state.results[state.highlightedIndex] ?? null, [
    state.results,
    state.highlightedIndex,
  ]);

  return { ...state, search, close, moveHighlight, pickHighlighted };
}

export function MentionAutocompleteList({
  state,
  onPick,
  onHover,
}: {
  state: MentionAutocompleteState;
  onPick: (candidate: MentionCandidate) => void;
  onHover: (index: number) => void;
}): JSX.Element | null {
  if (!state.open || state.results.length === 0) return null;
  return (
    <div className="mention-autocomplete" role="listbox" aria-label="Mention suggestions">
      {state.results.map((candidate, index) => (
        <button
          key={`${candidate.kind}:${candidate.id}`}
          type="button"
          role="option"
          aria-selected={index === state.highlightedIndex}
          className={`mention-autocomplete__item${index === state.highlightedIndex ? ' mention-autocomplete__item--active' : ''}`}
          onMouseEnter={() => onHover(index)}
          onClick={() => onPick(candidate)}
        >
          <Avatar name={candidate.name} src={candidate.avatarUrl ?? null} color={candidate.color ?? null} size={22} round />
          <span className="mention-autocomplete__name">{candidate.name}</span>
        </button>
      ))}
    </div>
  );
}
