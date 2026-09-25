import { useCallback, useMemo } from 'react';
import { EMOTIONS, getEmotion, getEmotionFamily, type Emotion } from '@pluralnova/shared';
import { useCollection } from './data.js';

/**
 * Every emotion a system can log: the built-in catalogue plus whatever it has
 * added of its own. A custom emotion's id is prefixed so it can never collide
 * with a catalogue one, and it carries its family's colour unless it was
 * given its own — so charts and "top families" summaries treat it exactly
 * like a catalogue emotion once it's logged.
 */
export function useAllEmotions(): {
  emotions: Emotion[];
  findEmotion: (id: string) => Emotion | undefined;
} {
  const custom = useCollection('customEmotions');

  const customEmotions = useMemo<Emotion[]>(
    () =>
      custom.items.map((row) => ({
        id: `custom.${row.id}`,
        name: String(row['name']),
        family: String(row['family']),
        color: (row['color'] as string) || getEmotionFamily(String(row['family']))?.color || '#8a93a8',
        emoji: (row['emoji'] as string) || '✨',
      })),
    [custom.items],
  );

  const emotions = useMemo(() => [...EMOTIONS, ...customEmotions], [customEmotions]);
  const byId = useMemo(() => new Map(emotions.map((emotion) => [emotion.id, emotion])), [emotions]);
  const findEmotion = useCallback((id: string) => byId.get(id) ?? getEmotion(id), [byId]);

  return { emotions, findEmotion };
}

/** Emotions this account has starred, catalogue or custom, for quick access when logging. */
export function useFavoriteEmotions(): {
  ids: Set<string>;
  loading: boolean;
  toggle: (emotionId: string) => Promise<void>;
} {
  const favorites = useCollection('favoriteEmotions');
  const ids = useMemo(() => new Set(favorites.items.map((row) => String(row['emotionId']))), [favorites.items]);

  const toggle = useCallback(
    async (emotionId: string) => {
      const existing = favorites.items.find((row) => row['emotionId'] === emotionId);
      if (existing) await favorites.remove(existing.id);
      else await favorites.create({ emotionId });
    },
    [favorites],
  );

  return { ids, loading: favorites.loading, toggle };
}

/** The same match rule as the catalogue's own `searchEmotions`, over any list — needed once custom emotions are in the mix. */
export function filterEmotions(all: readonly Emotion[], query: string): Emotion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...all];
  return all.filter((emotion) => emotion.name.toLowerCase().includes(q) || emotion.family.includes(q));
}
