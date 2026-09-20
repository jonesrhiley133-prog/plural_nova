import { CollectionScreen } from '../ui/CollectionScreen.js';
import { DescriptiveNote } from '../ui/feedback.js';

/**
 * Flags are markers a system defines for itself, then attaches to profiles and
 * records. Nothing here is preset beyond a handful of starting categories.
 */
export default function Flags(): JSX.Element {
  return (
    <CollectionScreen
      collection="flags"
      description="Reusable markers you define — boundaries, content notes, communication preferences, anything."
      emptyTitle="No flags yet"
      emptyBody="Create one, then attach it to whichever profiles or records it applies to."
      above={
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <DescriptiveNote>
            Flags appear on the profiles and records you attach them to. They are only ever visible
            to you unless the record itself is shared.
          </DescriptiveNote>
        </div>
      }
    />
  );
}
