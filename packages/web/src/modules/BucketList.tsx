import { CollectionScreen } from '../ui/CollectionScreen.js';

export default function BucketList(): JSX.Element {
  return (
    <CollectionScreen
      collection="bucketListItems"
      description="Things the whole {{system}} wants to do together someday."
      emptyTitle="Nothing on the list yet"
      emptyBody="Add something you'd like to do together — check it off whenever you get there."
    />
  );
}
