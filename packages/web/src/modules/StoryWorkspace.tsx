import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecord } from '../core/data.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, Stat, Tabs } from '../ui/primitives.js';
import { TextField } from '../ui/forms.js';
import { AsyncContent, EmptyState, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';

/**
 * A story, open.
 *
 * Chapters, scenes, characters, locations, worldbuilding and a timeline, all
 * scoped to this project. The chapter editor saves on demand rather than on
 * every keystroke, and says when it last saved.
 */

type Tab = 'chapters' | 'scenes' | 'characters' | 'locations' | 'world';

export default function StoryWorkspace(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const story = useRecord('stories', id);
  const stories = useCollection('stories');
  const chapters = useCollection('storyChapters', { filter: (row) => row['storyId'] === id });
  const scenes = useCollection('storyScenes', { filter: (row) => row['storyId'] === id });
  const locations = useCollection('storyLocations', { filter: (row) => row['storyId'] === id });
  const characters = useCollection('characters');

  const [tab, setTab] = useState<Tab>('chapters');
  const [openChapter, setOpenChapter] = useState<string | null>(null);
  const editor = useDialog<{ collection: string; record: StoredRecord | null }>();
  const confirm = useDialog<{ collection: string; record: StoredRecord }>();

  const linked = useMemo(
    () => characters.items.filter((character) => ((character['storyIds'] as string[]) ?? []).includes(id ?? '')),
    [characters.items, id],
  );

  const words = chapters.items.reduce((sum, chapter) => sum + Number(chapter['wordCount'] ?? 0), 0);

  if (!story) {
    return stories.loading ? (
      <SkeletonList rows={4} />
    ) : (
      <Card>
        <EmptyState
          icon="story"
          title="That story is not here"
          body="It may have been deleted, or the link may be out of date."
          action={{ label: 'Back to stories', run: () => navigate('/stories') }}
        />
      </Card>
    );
  }

  const collectionFor = (name: string) =>
    name === 'storyChapters' ? chapters : name === 'storyScenes' ? scenes : locations;

  return (
    <>
      <PageHeader
        title={String(story['title'])}
        description={String(story['summary'] ?? '')}
        actions={
          <>
            <Button variant="ghost" icon="chevronLeft" onClick={() => navigate('/stories')}>
              Stories
            </Button>
            <Button
              variant="primary"
              icon="plus"
              onClick={() =>
                editor.show({
                  collection:
                    tab === 'scenes' ? 'storyScenes' : tab === 'locations' ? 'storyLocations' : 'storyChapters',
                  record: null,
                })
              }
            >
              Add
            </Button>
          </>
        }
      />

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Chapters" value={chapters.items.length} />
        <Stat label="Scenes" value={scenes.items.length} />
        <Stat label="Words" value={words.toLocaleString()} />
        <Stat label="Status" value={String(story['status'] ?? 'planning')} />
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        label="Story sections"
        options={(['chapters', 'scenes', 'characters', 'locations', 'world'] as const).map((option) => ({
          value: option,
          label: option[0]!.toUpperCase() + option.slice(1),
        }))}
      />

      {tab === 'chapters' ? (
        <AsyncContent
          loading={chapters.loading}
          error={chapters.error}
          items={chapters.items}
          onRetry={chapters.reload}
          empty={{
            title: 'No chapters yet',
            body: 'Add the first one — it can be a title and nothing else.',
            icon: 'story',
            action: { label: 'Add a chapter', run: () => editor.show({ collection: 'storyChapters', record: null }) },
          }}
        >
          {(items) => (
            <div className="stack">
              {items.map((chapter) => (
                <Card key={chapter.id}>
                  <div className="row row--between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontSize: 'var(--size-md)' }}>{String(chapter['title'])}</h3>
                      <div className="tiny faint">
                        {Number(chapter['wordCount'] ?? 0).toLocaleString()} words · {String(chapter['status'] ?? 'draft')}
                      </div>
                    </div>
                    <div className="row row--nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenChapter(openChapter === chapter.id ? null : chapter.id)}
                      >
                        {openChapter === chapter.id ? 'Close' : 'Write'}
                      </Button>
                      <IconButton
                        icon="trash"
                        label="Delete chapter"
                        variant="ghost"
                        size="sm"
                        onClick={() => confirm.show({ collection: 'storyChapters', record: chapter })}
                      />
                    </div>
                  </div>

                  {chapter['summary'] ? (
                    <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>
                      {String(chapter['summary'])}
                    </p>
                  ) : null}

                  {openChapter === chapter.id ? (
                    <ChapterEditor
                      chapter={chapter}
                      onSave={async (values) => {
                        await chapters.update(chapter.id, values);
                        toast.success('Saved');
                      }}
                    />
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'scenes' ? (
        <AsyncContent
          loading={scenes.loading}
          error={scenes.error}
          items={scenes.items}
          onRetry={scenes.reload}
          empty={{
            title: 'No scenes yet',
            body: 'Scenes sit under chapters, or on their own while you work out the order.',
            icon: 'story',
            action: { label: 'Add a scene', run: () => editor.show({ collection: 'storyScenes', record: null }) },
          }}
        >
          {(items) => (
            <Card flush>
              <div className="list">
                {items.map((scene) => (
                  <div key={scene.id} className="list-row">
                    <span className="list-row__body">
                      <span className="list-row__title">{String(scene['title'])}</span>
                      <span className="list-row__meta">
                        {scene['pov'] ? <Chip>POV: {String(scene['pov'])}</Chip> : null}
                        {((scene['characterIds'] as string[]) ?? []).slice(0, 3).map((characterId) => {
                          const character = characters.items.find((row) => row.id === characterId);
                          return character ? <Chip key={characterId}>{String(character['name'])}</Chip> : null;
                        })}
                      </span>
                    </span>
                    <span className="list-row__trailing">
                      <IconButton
                        icon="edit"
                        label="Edit scene"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.show({ collection: 'storyScenes', record: scene })}
                      />
                      <IconButton
                        icon="trash"
                        label="Delete scene"
                        variant="ghost"
                        size="sm"
                        onClick={() => confirm.show({ collection: 'storyScenes', record: scene })}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'characters' ? (
        <Card
          title="Characters in this story"
          subtitle="Linked from your character database"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/characters')}>
              Open characters
            </Button>
          }
        >
          {linked.length === 0 ? (
            <EmptyState
              icon="character"
              title="Nobody linked yet"
              body="Open a character and add this story to their 'appears in' list."
            />
          ) : (
            <div className="grid" style={{ ['--grid-min' as never]: '160px' }}>
              {linked.map((character) => (
                <div key={character.id} className="row row--nowrap">
                  <Avatar
                    name={String(character['name'])}
                    src={(character['imageUrl'] as string) ?? null}
                    color={(character['color'] as string) ?? null}
                    size={34}
                    round
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className="small truncate">{String(character['name'])}</div>
                    <div className="tiny faint truncate">{String(character['role'] ?? '')}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'locations' ? (
        <AsyncContent
          loading={locations.loading}
          error={locations.error}
          items={locations.items}
          onRetry={locations.reload}
          empty={{
            title: 'No locations yet',
            body: 'Places in the story, separate from your real-world locations.',
            icon: 'location',
            action: { label: 'Add a location', run: () => editor.show({ collection: 'storyLocations', record: null }) },
          }}
        >
          {(items) => (
            <div className="grid" style={{ ['--grid-min' as never]: '210px' }}>
              {items.map((location) => (
                <Card
                  key={location.id}
                  title={String(location['name'])}
                  actions={
                    <IconButton
                      icon="edit"
                      label="Edit location"
                      variant="ghost"
                      size="sm"
                      onClick={() => editor.show({ collection: 'storyLocations', record: location })}
                    />
                  }
                >
                  {location['description'] ? (
                    <p className="small muted clamp-3">{String(location['description'])}</p>
                  ) : null}
                </Card>
              ))}
            </div>
          )}
        </AsyncContent>
      ) : null}

      {tab === 'world' ? (
        <Card title="Worldbuilding">
          <WorldEditor
            story={story}
            onSave={async (value) => {
              await stories.update(story.id, { worldbuilding: value });
              toast.success('Saved');
            }}
          />
        </Card>
      ) : null}

      <Dialog open={editor.open} onClose={editor.hide} title={editor.value?.record ? 'Edit' : 'Add'} wide>
        {editor.value ? (
          <RecordForm
            collection={editor.value.collection}
            record={editor.value.record}
            initial={{ storyId: story.id }}
            omit={editor.value.collection === 'storyChapters' ? ['body'] : []}
            onSubmit={async (values) => {
              const target = collectionFor(editor.value!.collection);
              if (editor.value!.record) await target.update(editor.value!.record.id, values);
              else await target.create({ ...values, storyId: story.id });
              toast.success('Saved');
              editor.hide();
            }}
            onCancel={editor.hide}
          />
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this?"
        body="It is removed from the story."
        onConfirm={async () => {
          if (!confirm.value) return;
          await collectionFor(confirm.value.collection).remove(confirm.value.record.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}

function ChapterEditor({
  chapter,
  onSave,
}: {
  chapter: StoredRecord;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const [body, setBody] = useState(String(chapter['body'] ?? ''));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const dirty = body !== String(chapter['body'] ?? '');

  return (
    <div style={{ marginTop: 'var(--space-4)' }}>
      <textarea
        className="textarea"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={18}
        aria-label={`${String(chapter['title'])} text`}
        style={{ lineHeight: 1.75, fontSize: 'var(--size-md)' }}
      />
      <div className="row row--between" style={{ marginTop: 'var(--space-3)' }}>
        <span className="tiny faint numeric">
          {wordCount.toLocaleString()} words
          {savedAt ? ` · saved ${savedAt}` : dirty ? ' · unsaved changes' : ''}
        </span>
        <Button
          variant="primary"
          size="sm"
          icon="check"
          disabled={!dirty}
          loading={saving}
          onClick={() => {
            setSaving(true);
            void onSave({ body, wordCount })
              .then(() => setSavedAt(new Date().toLocaleTimeString()))
              .finally(() => setSaving(false));
          }}
        >
          Save chapter
        </Button>
      </div>
    </div>
  );
}

function WorldEditor({
  story,
  onSave,
}: {
  story: StoredRecord;
  onSave: (value: string) => Promise<void>;
}): JSX.Element {
  const [value, setValue] = useState(String(story['worldbuilding'] ?? ''));
  const [saving, setSaving] = useState(false);

  return (
    <>
      <TextField
        label="Notes about the world"
        value={value}
        onChange={setValue}
        multiline
        rows={14}
        hint="Rules, history, geography — whatever needs to stay consistent."
      />
      <Button
        variant="primary"
        size="sm"
        disabled={value === String(story['worldbuilding'] ?? '')}
        loading={saving}
        onClick={() => {
          setSaving(true);
          void onSave(value).finally(() => setSaving(false));
        }}
      >
        Save
      </Button>
    </>
  );
}
