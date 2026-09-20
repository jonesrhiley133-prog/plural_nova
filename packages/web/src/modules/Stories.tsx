import { useNavigate } from 'react-router-dom';
import { useCollection } from '../core/data.js';
import { CollectionScreen } from '../ui/CollectionScreen.js';
import { Card, Chip, Meter } from '../ui/primitives.js';

/**
 * Story projects. The workspace behind each one holds the chapters, scenes,
 * characters and locations; this screen is the shelf.
 */
export default function Stories(): JSX.Element {
  const navigate = useNavigate();
  const chapters = useCollection('storyChapters');

  return (
    <CollectionScreen
      collection="stories"
      layout="grid"
      title="Story builder"
      description="Projects, with everything that belongs to them a tap away."
      emptyTitle="No stories yet"
      emptyBody="Start one and the chapters, scenes, characters and places live inside it."
      renderRow={(story) => {
        const own = chapters.items.filter((chapter) => chapter['storyId'] === story.id);
        const words = own.reduce((sum, chapter) => sum + Number(chapter['wordCount'] ?? 0), 0);
        const goal = Number(story['wordGoal'] ?? 0);

        return (
          <Card
            interactive
            onClick={() => navigate(`/stories/${story.id}`)}
            title={String(story['title'])}
            subtitle={String(story['genre'] ?? '')}
          >
            {story['summary'] ? <p className="small muted clamp-3">{String(story['summary'])}</p> : null}

            <div className="row" style={{ marginTop: 'var(--space-3)' }}>
              <Chip accent>{String(story['status'] ?? 'planning')}</Chip>
              <Chip>{own.length} {own.length === 1 ? 'chapter' : 'chapters'}</Chip>
              <Chip>{words.toLocaleString()} words</Chip>
            </div>

            {goal > 0 ? (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Meter
                  value={words}
                  max={goal}
                  color={(story['color'] as string) || undefined}
                  label={`${words} of ${goal} words`}
                />
                <p className="tiny faint" style={{ marginTop: 3 }}>
                  {Math.round((words / goal) * 100)}% of the goal you set
                </p>
              </div>
            ) : null}
          </Card>
        );
      }}
    />
  );
}
