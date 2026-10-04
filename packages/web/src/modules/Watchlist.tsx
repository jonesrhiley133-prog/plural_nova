import { CollectionScreen } from '../ui/CollectionScreen.js';

export default function Watchlist(): JSX.Element {
  return (
    <CollectionScreen
      collection="watchlistItems"
      description="Shows and movies the {{system}} wants to watch together."
      emptyTitle="Nothing queued up yet"
      emptyBody="Add a show or a movie, and track it through to watched."
    />
  );
}
