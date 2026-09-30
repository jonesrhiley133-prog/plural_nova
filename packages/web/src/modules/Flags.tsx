import { CollectionScreen } from '../ui/CollectionScreen.js';
import { DescriptiveNote } from '../ui/feedback.js';
import { IconButton } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';

/**
 * Flags are markers a system defines for itself, then attaches to profiles and
 * records. Modelled on the Media library rather than a generic form list — an
 * image-forward gallery, since a flag is something you recognise at a glance
 * more than something you read a category for.
 */
export default function Flags(): JSX.Element {
  return (
    <CollectionScreen
      collection="flags"
      description="Reusable markers you define — boundaries, content notes, communication preferences, anything."
      emptyTitle="No flags yet"
      emptyBody="Create one, then attach it to whichever profiles or records it applies to."
      layout="grid"
      gridMinWidth={130}
      formOmit={['category', 'showOnProfile', 'icon']}
      above={
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <DescriptiveNote>
            Flags appear on the profiles and records you attach them to. They are only ever visible
            to you unless the record itself is shared.
          </DescriptiveNote>
        </div>
      }
      renderRow={(flag, helpers) => {
        const name = String(flag['name'] ?? 'Untitled');
        const imageUrl = flag['imageUrl'] as string | null;
        const color = (flag['color'] as string) || 'var(--accent)';
        return (
          <div
            className="card card--flush"
            style={{ aspectRatio: '1', overflow: 'hidden', position: 'relative', padding: 0 }}
          >
            <button
              type="button"
              className="card--interactive"
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                border: 'none',
                padding: 0,
                background: 'none',
                cursor: 'pointer',
              }}
              onClick={helpers.edit}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    height: '100%',
                    gap: 6,
                    background: `color-mix(in srgb, ${color} 16%, var(--surface))`,
                    color,
                  }}
                >
                  <Icon name="flag" size={28} />
                </span>
              )}
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: 'var(--space-2)',
                  background:
                    'linear-gradient(to top, color-mix(in srgb, var(--bg) 88%, transparent) 8%, transparent 60%)',
                }}
              >
                <span className="tiny truncate" style={{ display: 'block', fontWeight: 'var(--weight-semibold)' }}>
                  {name}
                </span>
              </span>
            </button>
            <span style={{ position: 'absolute', top: 4, right: 4 }}>
              <IconButton
                icon="trash"
                label={`Delete ${name}`}
                variant="ghost"
                size="sm"
                onClick={helpers.remove}
              />
            </span>
          </div>
        );
      }}
    />
  );
}
