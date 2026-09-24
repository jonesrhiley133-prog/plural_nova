import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollection } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, Meter, SegmentedControl } from '../ui/primitives.js';
import { SearchField, SelectField, useDebounced } from '../ui/forms.js';
import { AsyncContent } from '../ui/feedback.js';
import { useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { resolveTemplate, StoryTemplatePicker, TEMPLATES, type StoryTemplate } from './storyTemplates.js';

/**
 * The story shelf.
 *
 * Continue whatever was open last, filter and search the rest, or start fresh
 * from a template — each one is just a sensible first chapter, not a separate
 * system, so a template a system outgrows is nothing more than text to delete.
 */

type StatusFilter = 'all' | 'drafts' | 'completed' | 'paused';
type SortKey = 'updated' | 'title' | 'words';

function statusBucket(status: string): StatusFilter {
  if (status === 'finished') return 'completed';
  if (status === 'shelved') return 'paused';
  return 'drafts'; // planning, drafting, revising
}

export default function Stories(): JSX.Element {
  const navigate = useNavigate();
  const dates = useDateFormat();
  const toast = useToast();
  const stories = useCollection('stories');
  const chapters = useCollection('storyChapters');
  const picker = useDialog();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounced(rawSearch);
  const [sortKey, setSortKey] = useState<SortKey>('updated');

  const wordsFor = (storyId: string): number =>
    chapters.items
      .filter((chapter) => chapter['storyId'] === storyId)
      .reduce((sum, chapter) => sum + Number(chapter['wordCount'] ?? 0), 0);

  // The collection already sorts by updatedAt desc, so the first item is the
  // one most recently touched — including by opening it, not only editing it.
  const mostRecent = stories.items[0] ?? null;

  const visible = useMemo(() => {
    let list = stories.items;
    if (statusFilter !== 'all') {
      list = list.filter((story) => statusBucket(String(story['status'] ?? 'planning')) === statusFilter);
    }
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      list = list.filter((story) => String(story['title'] ?? '').toLowerCase().includes(query));
    }
    const sorted = [...list];
    if (sortKey === 'title') sorted.sort((a, b) => String(a['title'] ?? '').localeCompare(String(b['title'] ?? '')));
    else if (sortKey === 'words') sorted.sort((a, b) => wordsFor(String(b.id)) - wordsFor(String(a.id)));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stories.items, statusFilter, search, sortKey, chapters.items]);

  const startFromTemplate = async (template: StoryTemplate | null): Promise<void> => {
    try {
      const story = await stories.create({ title: 'Untitled Story', status: 'planning' });
      const { title, body } = resolveTemplate(template);
      // Matches the word count the chapter editor itself computes on save, so
      // a template's starter text is not misreported as empty until opened.
      const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
      await chapters.create({ storyId: story.id, title, body, wordCount, sortOrder: 0 });
      navigate(`/stories/${story.id}`);
    } catch (cause) {
      toast.fromError(cause);
    }
  };

  return (
    <>
      <PageHeader
        title="Story builder"
        description="A calm, focused place to create your stories."
        actions={
          <Button variant="primary" icon="plus" onClick={() => picker.show()}>
            Start a story
          </Button>
        }
      />

      {mostRecent ? (
        <Card style={{ marginBottom: 'var(--space-5)' }}>
          <p className="tiny faint">
            <Icon name="clock" size={12} /> Last edited {dates.relative(String(mostRecent['updatedAt'] ?? ''))}
          </p>
          <h3 style={{ margin: 'var(--space-2) 0 var(--space-3)' }}>
            {String(mostRecent['title'] ?? '').trim() || 'Untitled Story'}
          </h3>
          <Button variant="primary" size="sm" icon="edit" onClick={() => navigate(`/stories/${mostRecent.id}`)}>
            Continue writing
          </Button>
        </Card>
      ) : null}

      <h2 className="tiny faint" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 var(--space-3)' }}>
        My stories
      </h2>
      <div className="row row--between" style={{ marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <SegmentedControl
          label="Filter stories"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'drafts', label: 'Drafts' },
            { value: 'completed', label: 'Completed' },
            { value: 'paused', label: 'Paused' },
          ]}
        />
        <div className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <SearchField value={rawSearch} onChange={setRawSearch} placeholder="Search stories…" />
          <SelectField
            label="Sort"
            value={sortKey}
            onChange={(value) => setSortKey(value as SortKey)}
            placeholder="Recently edited"
            options={[
              { value: 'updated', label: 'Recently edited' },
              { value: 'title', label: 'Title' },
              { value: 'words', label: 'Word count' },
            ]}
          />
        </div>
      </div>

      <AsyncContent
        loading={stories.loading}
        error={stories.error}
        items={visible}
        onRetry={stories.reload}
        empty={{
          title: stories.items.length === 0 ? 'No stories yet' : 'Nothing matches that filter',
          body:
            stories.items.length === 0
              ? 'Start one above, or from a template below.'
              : 'Try a different status, or clear the search.',
          icon: 'story',
        }}
      >
        {(records) => (
          <div className="grid grid--columns" style={{ ['--grid-columns' as never]: 3, marginBottom: 'var(--space-6)' }}>
            {records.map((story) => {
              const words = wordsFor(String(story.id));
              const chapterCount = chapters.items.filter((chapter) => chapter['storyId'] === story.id).length;
              const goal = Number(story['wordGoal'] ?? 0);

              return (
                <Card
                  key={story.id}
                  interactive
                  onClick={() => navigate(`/stories/${story.id}`)}
                  title={String(story['title'] ?? '').trim() || 'Untitled Story'}
                  subtitle={String(story['genre'] ?? '')}
                >
                  {story['summary'] ? <p className="small muted clamp-3">{String(story['summary'])}</p> : null}

                  <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                    <Chip accent>{String(story['status'] ?? 'planning')}</Chip>
                    <Chip>{chapterCount} {chapterCount === 1 ? 'chapter' : 'chapters'}</Chip>
                    <Chip>{words.toLocaleString()} words</Chip>
                  </div>

                  {goal > 0 ? (
                    <div style={{ marginTop: 'var(--space-3)' }}>
                      <Meter value={words} max={goal} color={(story['color'] as string) || undefined} label={`${words} of ${goal} words`} />
                      <p className="tiny faint" style={{ marginTop: 3 }}>
                        {Math.round((words / goal) * 100)}% of the goal you set
                      </p>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </AsyncContent>

      <h2 className="tiny faint" style={{ letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 var(--space-3)' }}>
        Templates
      </h2>
      <div className="grid grid--columns" style={{ ['--grid-columns' as never]: 3 }}>
        {TEMPLATES.map((template) => (
          <Card key={template.id} title={template.label} subtitle="Built-in">
            <p className="small muted">{template.description}</p>
            <Button variant="ghost" size="sm" iconRight="chevronRight" onClick={() => void startFromTemplate(template)}>
              Use template
            </Button>
          </Card>
        ))}
      </div>

      <StoryTemplatePicker open={picker.open} onClose={picker.hide} onPick={(template) => { picker.hide(); void startFromTemplate(template); }} />
    </>
  );
}
