import { useState } from 'react';
import { useCollection, useRecordMap } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useActiveMemberId } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton } from '../ui/primitives.js';
import { AsyncContent } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { RecordForm } from '../ui/RecordForm.js';
import { Icon } from '../ui/Icon.js';
import type { StoredRecord } from '@pluralnova/shared';

/**
 * The bulletin board.
 *
 * An internal noticeboard — announcements, reminders, things worth leaving
 * where everyone will see them. Pinned posts stay at the top; archived ones
 * stay available rather than being deleted.
 */
export default function Bulletin(): JSX.Element {
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();
  const activeMemberId = useActiveMemberId();
  const members = useRecordMap('members');

  const [showArchived, setShowArchived] = useState(false);
  const [tag, setTag] = useState<string | null>(null);

  const posts = useCollection('bulletinPosts', {
    filter: (post) => (showArchived ? post['archived'] === true : post['archived'] !== true),
    sort: (a, b) =>
      Number(b['pinned'] === true) - Number(a['pinned'] === true) ||
      String(b['postedAt']).localeCompare(String(a['postedAt'])),
  });

  const tags = [
    ...new Set(posts.all.flatMap((post) => ((post['tags'] as string[]) ?? []))),
  ].sort();

  const editor = useDialog<StoredRecord>();
  const confirm = useDialog<StoredRecord>();
  const [creating, setCreating] = useState(false);

  const visible = tag
    ? posts.items.filter((post) => ((post['tags'] as string[]) ?? []).includes(tag))
    : posts.items;

  return (
    <>
      <PageHeader
        title="Bulletin board"
        description={term('Notices for the whole {{system}}. Nothing here leaves the account.')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New post
          </Button>
        }
      />

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <Chip selected={!tag && !showArchived} onClick={() => { setTag(null); setShowArchived(false); }}>
          Everything
        </Chip>
        {tags.map((name) => (
          <Chip key={name} selected={tag === name} onClick={() => setTag(tag === name ? null : name)}>
            #{name}
          </Chip>
        ))}
        <span className="spacer" />
        <Chip selected={showArchived} onClick={() => setShowArchived((value) => !value)}>
          Archived
        </Chip>
      </div>

      <AsyncContent
        loading={posts.loading}
        error={posts.error}
        items={visible}
        onRetry={posts.reload}
        empty={{
          title: 'Nothing on the board',
          body: term('House rules, reminders, things somebody wants everyone to see.'),
          icon: 'bulletin',
          action: { label: 'New post', run: () => setCreating(true) },
        }}
      >
        {(records) => (
          <div className="grid" style={{ ['--grid-min' as never]: '280px' }}>
            {records.map((post) => {
              const author = post['memberId'] ? members.get(String(post['memberId'])) : null;
              return (
                <Card key={post.id} raised={post['pinned'] === true}>
                  <div className="row row--between" style={{ alignItems: 'flex-start' }}>
                    <div className="row row--nowrap" style={{ minWidth: 0 }}>
                      {author ? (
                        <Avatar
                          name={String(author['name'])}
                          src={(author['avatarUrl'] as string) ?? null}
                          color={(author['color'] as string) ?? null}
                          icon={(author['icon'] as string) ?? null}
                          size={28}
                          round
                        />
                      ) : null}
                      <div style={{ minWidth: 0 }}>
                        <div className="tiny faint">
                          {author ? String(author['name']) : term('The {{system}}')} ·{' '}
                          {dates.relative(String(post['postedAt']))}
                        </div>
                      </div>
                    </div>
                    <div className="row row--nowrap">
                      {post['pinned'] === true ? (
                        <span style={{ color: 'var(--accent)' }}>
                          <Icon name="pin" size={13} label="Pinned" />
                        </span>
                      ) : null}
                      <IconButton
                        icon="edit"
                        label="Edit post"
                        variant="ghost"
                        size="sm"
                        onClick={() => editor.show(post)}
                      />
                      <IconButton
                        icon="trash"
                        label="Delete post"
                        variant="ghost"
                        size="sm"
                        onClick={() => confirm.show(post)}
                      />
                    </div>
                  </div>

                  {post['title'] ? (
                    <h3 style={{ fontSize: 'var(--size-md)', marginTop: 'var(--space-3)' }}>
                      {String(post['title'])}
                    </h3>
                  ) : null}
                  {post['body'] ? (
                    <p className="prose small" style={{ marginTop: 'var(--space-2)' }}>
                      {String(post['body'])}
                    </p>
                  ) : null}

                  <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                    <Chip>{String(post['kind'] ?? 'note')}</Chip>
                    {((post['tags'] as string[]) ?? []).map((name) => (
                      <Chip key={name}>#{name}</Chip>
                    ))}
                  </div>

                  <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void posts
                          .update(post.id, { pinned: post['pinned'] !== true })
                          .catch((cause: unknown) => toast.fromError(cause));
                      }}
                    >
                      {post['pinned'] === true ? t('action.unpin') : t('action.pin')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void posts
                          .update(post.id, { archived: post['archived'] !== true })
                          .catch((cause: unknown) => toast.fromError(cause));
                      }}
                    >
                      {post['archived'] === true ? t('action.restore') : t('action.archive')}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </AsyncContent>

      <Dialog
        open={creating || editor.open}
        onClose={() => {
          setCreating(false);
          editor.hide();
        }}
        title={editor.value ? 'Edit post' : 'New post'}
      >
        <RecordForm
          collection="bulletinPosts"
          record={editor.value}
          initial={{ postedAt: new Date().toISOString(), memberId: activeMemberId }}
          omit={['attachmentIds', 'reactions']}
          onSubmit={async (values) => {
            if (editor.value) {
              await posts.update(editor.value.id, values);
              toast.success('Saved');
              editor.hide();
            } else {
              await posts.create(values);
              toast.success('Posted');
              setCreating(false);
            }
          }}
          onCancel={() => {
            setCreating(false);
            editor.hide();
          }}
        />
      </Dialog>

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this post?"
        body={t('confirm.deleteBody')}
        onConfirm={async () => {
          if (!confirm.value) return;
          await posts.remove(confirm.value.id);
          toast.success('Deleted');
        }}
      />
    </>
  );
}
