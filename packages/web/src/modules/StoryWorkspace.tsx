import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { StoredRecord } from '@pluralnova/shared';
import { useCollection, useRecord } from '../core/data.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, Stat, Tabs } from '../ui/primitives.js';
import { ColorField, TextField } from '../ui/forms.js';
import { AsyncContent, EmptyState, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';
import { resolveTemplate, StoryTemplatePicker, type StoryTemplate } from './storyTemplates.js';

/**
 * A story, open.
 *
 * The chapters, and everything about the story itself, share one screen: a
 * rail to move between chapters, the page being written, and the story's own
 * facts beside it — so naming a place in "Setting" and using it in the next
 * paragraph never means leaving the paragraph. Scenes and locations, which
 * are closer to a database than to a page, keep their own tab instead.
 */

type MainTab = 'write' | 'scenes' | 'locations';
type InfoTab = 'info' | 'cast' | 'notes';

const STATUS_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'drafting', label: 'Drafting' },
  { value: 'revising', label: 'Revising' },
  { value: 'finished', label: 'Complete' },
  { value: 'shelved', label: 'Paused' },
];

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

  const [mainTab, setMainTab] = useState<MainTab>('write');
  const [infoTab, setInfoTab] = useState<InfoTab>('info');
  const [openChapterId, setOpenChapterId] = useState<string | null>(null);
  const editor = useDialog<{ collection: string; record: StoredRecord | null }>();
  const confirm = useDialog<{ collection: string; record: StoredRecord }>();
  const chapterPicker = useDialog();

  const linked = useMemo(
    () => characters.items.filter((character) => ((character['storyIds'] as string[]) ?? []).includes(id ?? '')),
    [characters.items, id],
  );

  const words = chapters.items.reduce((sum, chapter) => sum + Number(chapter['wordCount'] ?? 0), 0);
  const openChapter = chapters.items.find((chapter) => chapter.id === openChapterId) ?? chapters.items[0] ?? null;

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

  const addChapter = async (template: StoryTemplate | null): Promise<void> => {
    const { title, body } = resolveTemplate(template);
    const chapterTitle = template ? title : `Chapter ${chapters.items.length + 1}`;
    const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
    const created = await chapters.create({
      storyId: story.id,
      title: chapterTitle,
      body,
      wordCount,
      sortOrder: chapters.items.length,
    });
    setOpenChapterId(created.id);
    setMainTab('write');
  };

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: 'var(--space-3)', gap: 'var(--space-2)' }}>
        <Button variant="ghost" size="sm" icon="chevronLeft" onClick={() => navigate('/stories')}>
          Stories
        </Button>
        <span className="tiny faint">/</span>
        <span className="small" style={{ fontWeight: 'var(--weight-medium)' }}>
          {String(story['title'] ?? '').trim() || 'Untitled Story'}
        </span>
      </div>

      <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Chapters" value={chapters.items.length} />
        <Stat label="Scenes" value={scenes.items.length} />
        <Stat label="Words" value={words.toLocaleString()} />
        <Stat label="Status" value={STATUS_OPTIONS.find((option) => option.value === story['status'])?.label ?? 'Planning'} />
      </div>

      <Tabs
        value={mainTab}
        onChange={setMainTab}
        label="Story sections"
        options={[
          { value: 'write', label: 'Chapters' },
          { value: 'scenes', label: 'Scenes' },
          { value: 'locations', label: 'Locations' },
        ]}
      />

      {mainTab === 'write' ? (
        <div className="story-workspace">
          <div className="story-workspace__rail">
            <div className="row row--between" style={{ marginBottom: 'var(--space-2)' }}>
              <span className="tiny faint" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Chapters · {chapters.items.length}
              </span>
            </div>
            <div className="row" style={{ marginBottom: 'var(--space-3)' }}>
              <Button variant="secondary" size="sm" icon="plus" onClick={() => void addChapter(null)}>
                Add
              </Button>
              <Button variant="ghost" size="sm" icon="story" onClick={() => chapterPicker.show()}>
                Template
              </Button>
            </div>
            {chapters.items.length === 0 ? (
              <p className="tiny faint">No chapters yet.</p>
            ) : (
              <div className="stack stack--tight">
                {chapters.items.map((chapter, index) => (
                  <button
                    key={chapter.id}
                    type="button"
                    className={`story-rail-item${openChapter?.id === chapter.id ? ' story-rail-item--active' : ''}`}
                    onClick={() => setOpenChapterId(chapter.id)}
                  >
                    <span className="tiny faint numeric">{String(index + 1).padStart(2, '0')}</span>
                    <span className="truncate">{String(chapter['title'] ?? 'Untitled')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="story-workspace__editor">
            {openChapter ? (
              <ChapterEditor
                key={openChapter.id}
                chapter={openChapter}
                onSave={async (values) => {
                  await chapters.update(openChapter.id, values);
                  toast.success('Saved');
                }}
                onDelete={() => confirm.show({ collection: 'storyChapters', record: openChapter })}
              />
            ) : (
              <Card>
                <EmptyState
                  icon="story"
                  title="No chapters yet"
                  body="Add one, or start from a template — it can be a title and nothing else."
                  action={{ label: 'Add a chapter', run: () => void addChapter(null) }}
                />
              </Card>
            )}
          </div>

          <div className="story-workspace__info">
            <Tabs
              value={infoTab}
              onChange={setInfoTab}
              label="Story details"
              options={[
                { value: 'info', label: 'Story Info' },
                { value: 'cast', label: 'Story Cast' },
                { value: 'notes', label: 'Notes' },
              ]}
            />

            {infoTab === 'info' ? (
              <StoryInfoPanel story={story} onSave={(values) => stories.update(story.id, values)} />
            ) : null}

            {infoTab === 'cast' ? (
              <Card
                title="Cast"
                subtitle="Linked from your character database"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => navigate('/characters')}>
                    Open
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
                  <div className="stack stack--tight">
                    {linked.map((character) => (
                      <div key={character.id} className="row row--nowrap">
                        <Avatar
                          name={String(character['name'])}
                          src={(character['imageUrl'] as string) ?? null}
                          color={(character['color'] as string) ?? null}
                          size={30}
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

            {infoTab === 'notes' ? (
              <AutoSaveTextArea
                label="Notes"
                hint="Anything that doesn't belong in the world's own facts — reminders to yourself, threads to pick back up."
                value={String(story['notes'] ?? '')}
                onSave={(value) => stories.update(story.id, { notes: value })}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {mainTab === 'scenes' ? (
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
            <Card
              flush
              title="Scenes"
              actions={
                <Button variant="ghost" size="sm" icon="plus" onClick={() => editor.show({ collection: 'storyScenes', record: null })}>
                  Add
                </Button>
              }
            >
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

      {mainTab === 'locations' ? (
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

      <StoryTemplatePicker
        open={chapterPicker.open}
        onClose={chapterPicker.hide}
        onPick={(template) => {
          chapterPicker.hide();
          void addChapter(template);
        }}
      />

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
          if (confirm.value.record.id === openChapterId) setOpenChapterId(null);
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
  onDelete,
}: {
  chapter: StoredRecord;
  onSave: (values: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
}): JSX.Element {
  const toast = useToast();
  const [view, setView] = useState<'write' | 'preview'>('write');
  const [title, setTitle] = useState(String(chapter['title'] ?? ''));
  const [body, setBody] = useState(String(chapter['body'] ?? ''));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
  const dirty = body !== String(chapter['body'] ?? '') || title !== String(chapter['title'] ?? '');

  const save = (): void => {
    setSaving(true);
    void onSave({ title: title.trim() || 'Untitled', body, wordCount })
      .then(() => setSavedAt(new Date().toLocaleTimeString()))
      .catch((cause: unknown) => toast.fromError(cause, 'Could not save that'))
      .finally(() => setSaving(false));
  };

  return (
    <Card>
      <div className="row row--between" style={{ marginBottom: 'var(--space-3)' }}>
        <Tabs
          value={view}
          onChange={setView}
          label="Chapter view"
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
        <IconButton icon="trash" label="Delete chapter" variant="ghost" size="sm" onClick={onDelete} />
      </div>

      <input
        className="input"
        style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--space-3)' }}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        aria-label="Chapter title"
        placeholder="Chapter title"
      />

      {view === 'write' ? (
        <textarea
          className="textarea"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={18}
          aria-label={`${title} text`}
          placeholder="Write your chapter here…"
          style={{ lineHeight: 1.75, fontSize: 'var(--size-md)' }}
        />
      ) : (
        <div className="prose" style={{ minHeight: 300, whiteSpace: 'pre-wrap' }}>
          {body.trim() ? body : <span className="faint">Nothing written yet.</span>}
        </div>
      )}

      <div className="row row--between" style={{ marginTop: 'var(--space-3)' }}>
        <span className="tiny faint numeric">
          {wordCount.toLocaleString()} words
          {savedAt ? ` · saved ${savedAt}` : dirty ? ' · unsaved changes' : ''}
        </span>
        <Button variant="primary" size="sm" icon="check" disabled={!dirty} loading={saving} onClick={save}>
          Save chapter
        </Button>
      </div>
    </Card>
  );
}

function StoryInfoPanel({
  story,
  onSave,
}: {
  story: StoredRecord;
  onSave: (values: Record<string, unknown>) => unknown;
}): JSX.Element {
  const save = (field: string, value: unknown): void => {
    if (value === (story[field] ?? '')) return;
    void onSave({ [field]: value });
  };

  return (
    <Card style={{ marginTop: 'var(--space-3)' }}>
      <div className="field" style={{ marginBottom: 'var(--space-3)' }}>
        <span className="field__label">Status</span>
        <div className="row">
          {STATUS_OPTIONS.map((option) => (
            <Chip key={option.value} selected={story['status'] === option.value} onClick={() => save('status', option.value)}>
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <AutoSaveField label="Genre" placeholder="Fantasy, romance…" value={String(story['genre'] ?? '')} onSave={(value) => save('genre', value)} />
      <AutoSaveField label="Setting" placeholder="Where & when" value={String(story['setting'] ?? '')} onSave={(value) => save('setting', value)} />
      <ColorField label="Accent colour" value={String(story['color'] ?? '#8b5cf6')} onChange={(value) => save('color', value)} />
      <AutoSaveTextArea label="Synopsis" placeholder="What's the story about?" rows={3} value={String(story['summary'] ?? '')} onSave={(value) => save('summary', value)} />
      <AutoSaveTextArea label="Worldbuilding & lore" placeholder="Rules, history, magic systems…" rows={4} value={String(story['worldbuilding'] ?? '')} onSave={(value) => save('worldbuilding', value)} />
    </Card>
  );
}

/** A text field that saves itself on blur, once the value has actually changed. */
function AutoSaveField({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <TextField
        label={label}
        value={draft}
        onChange={setDraft}
        {...(placeholder ? { placeholder } : {})}
        onBlur={() => onSave(draft)}
      />
    </div>
  );
}

function AutoSaveTextArea({
  label,
  value,
  placeholder,
  hint,
  rows = 4,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  rows?: number;
  onSave: (value: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  return (
    <div style={{ marginBottom: 'var(--space-3)' }}>
      <TextField
        label={label}
        value={draft}
        onChange={setDraft}
        multiline
        rows={rows}
        {...(placeholder ? { placeholder } : {})}
        {...(hint ? { hint } : {})}
        onBlur={() => onSave(draft)}
      />
    </div>
  );
}
