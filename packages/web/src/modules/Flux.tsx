import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, messageFor } from '../core/api.js';
import { realtime } from '../core/realtime.js';
import { useCollection } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useSystemMode } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton } from '../ui/primitives.js';
import { SelectField, TextField } from '../ui/forms.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * Flux.
 *
 * A feed of the systems you are friends with. Posting as the system or as one
 * member is a first-class choice rather than a workaround, and visibility is
 * set per post — a post is never more visible than it was written to be.
 */

interface Post {
  id: string;
  body: string;
  postedAt: string;
  media: { url: string; alt?: string }[];
  authorKind: 'system' | 'member';
  memberId: string | null;
  visibility: string;
  reactionCount: number;
  commentCount: number;
  repostCount: number;
  tags: string[];
  edited: boolean;
  contentWarning: string;
  isMine: boolean;
  myReaction: string | null;
  author: { userId: string; displayName: string; avatarUrl: string; accent: string; handle: string | null };
  asMember: { id: string; name: string; color: string | null; icon: string | null; avatarUrl: string } | null;
}

interface Comment {
  id: string;
  body: string;
  postedAt: string;
  isMine: boolean;
  author: { displayName: string; avatarUrl: string };
}

const REACTIONS = ['★', '♡', '✧', '☾', '◍', '✓'];

export default function Flux(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();
  const toast = useToast();

  const [scope, setScope] = useState<'friends' | 'mine' | 'public'>('friends');
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const composer = useDialog();
  const confirm = useDialog<Post>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<{ posts: Post[] }>('/api/social/flux', { scope });
      setPosts(result.posts);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
    return realtime.on((event) => {
      if (event.type === 'flux.activity') void load();
    });
  }, [load]);

  const react = async (post: Post, emoji: string): Promise<void> => {
    try {
      const result = await api.post<{ emoji: string | null }>(
        `/api/social/flux/${post.id}/reactions`,
        { emoji },
      );
      setPosts((current) =>
        current.map((candidate) =>
          candidate.id === post.id
            ? {
                ...candidate,
                myReaction: result.emoji,
                reactionCount: candidate.reactionCount + (result.emoji ? (post.myReaction ? 0 : 1) : -1),
              }
            : candidate,
        ),
      );
    } catch (cause) {
      toast.fromError(cause, 'Could not react');
    }
  };

  const single = id ? posts.find((post) => post.id === id) : null;

  return (
    <>
      <PageHeader
        title="Flux"
        description="Posts from you and the systems you are friends with."
        actions={
          <Button variant="primary" icon="plus" onClick={() => composer.show()}>
            {t('social.newPost')}
          </Button>
        }
      />

      <div className="segmented" role="group" aria-label="Feed" style={{ marginBottom: 'var(--space-4)' }}>
        {(
          [
            ['friends', 'Friends'],
            ['mine', 'Mine'],
            ['public', 'Public'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="segmented__option"
            aria-pressed={scope === value}
            onClick={() => setScope(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && posts.length === 0 ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState
            icon="flux"
            title={t('social.noPosts')}
            body={t('social.noPostsBody')}
            action={{ label: t('social.newPost'), run: () => composer.show() }}
            secondaryAction={{ label: 'Find systems', run: () => navigate('/constellations') }}
          />
        </Card>
      ) : (
        <div className="stack">
          {(single ? [single] : posts).map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onReact={(emoji) => void react(post, emoji)}
              onDelete={() => confirm.show(post)}
              onOpen={() => navigate(`/flux/${post.id}`)}
              expanded={Boolean(single)}
            />
          ))}
        </div>
      )}

      {single ? (
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="ghost" icon="chevronLeft" onClick={() => navigate('/flux')}>
            Back to the feed
          </Button>
        </div>
      ) : null}

      <Composer dialog={composer} onPosted={() => void load()} />

      <ConfirmDialog
        open={confirm.open}
        onClose={confirm.hide}
        title="Delete this post?"
        body="It disappears for everyone who could see it."
        recoverable={false}
        onConfirm={async () => {
          if (!confirm.value) return;
          await api.delete(`/api/social/flux/${confirm.value.id}`);
          toast.success('Post deleted');
          void load();
        }}
      />
    </>
  );
}

function PostCard({
  post,
  onReact,
  onDelete,
  onOpen,
  expanded,
}: {
  post: Post;
  onReact: (emoji: string) => void;
  onDelete: () => void;
  onOpen: () => void;
  expanded: boolean;
}): JSX.Element {
  const dates = useDateFormat();
  const [showWarned, setShowWarned] = useState(!post.contentWarning);
  const [showReactions, setShowReactions] = useState(false);

  return (
    <Card>
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div className="row row--nowrap" style={{ minWidth: 0 }}>
          <Avatar
            name={post.asMember?.name ?? post.author.displayName}
            src={post.asMember?.avatarUrl || post.author.avatarUrl || null}
            color={post.asMember?.color ?? post.author.accent ?? null}
            icon={post.asMember?.icon ?? null}
            size={40}
            round
          />
          <div style={{ minWidth: 0 }}>
            <div className="truncate" style={{ fontWeight: 'var(--weight-medium)' }}>
              {post.asMember?.name ?? post.author.displayName}
              {post.asMember ? (
                <span className="faint"> · {post.author.displayName}</span>
              ) : null}
            </div>
            <div className="tiny faint">
              {dates.relative(post.postedAt)}
              {post.edited ? ' · edited' : ''} · {visibilityWord(post.visibility)}
            </div>
          </div>
        </div>
        {post.isMine ? (
          <IconButton icon="trash" label="Delete post" variant="ghost" size="sm" onClick={onDelete} />
        ) : null}
      </div>

      {post.contentWarning && !showWarned ? (
        <button
          type="button"
          className="card"
          style={{ width: '100%', marginTop: 'var(--space-3)', textAlign: 'left', cursor: 'pointer' }}
          onClick={() => setShowWarned(true)}
        >
          <div className="small">
            <Icon name="warning" size={13} /> {post.contentWarning}
          </div>
          <div className="tiny faint" style={{ marginTop: 4 }}>
            Tap to show this post.
          </div>
        </button>
      ) : (
        <>
          {post.body ? (
            <p className={`prose${expanded ? '' : ' clamp-3'}`} style={{ marginTop: 'var(--space-3)' }}>
              {post.body}
            </p>
          ) : null}

          {post.media.length > 0 ? (
            <div className="grid grid--tight" style={{ ['--grid-min' as never]: '140px', marginTop: 'var(--space-3)' }}>
              {post.media.map((item, index) => (
                <img
                  key={index}
                  src={item.url}
                  alt={item.alt ?? ''}
                  loading="lazy"
                  style={{ width: '100%', borderRadius: 'var(--radius-sm)', aspectRatio: '1', objectFit: 'cover' }}
                />
              ))}
            </div>
          ) : null}
        </>
      )}

      {post.tags.length > 0 ? (
        <div className="row" style={{ marginTop: 'var(--space-3)' }}>
          {post.tags.map((tag) => (
            <Chip key={tag}>#{tag}</Chip>
          ))}
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 'var(--space-3)' }}>
        <div style={{ position: 'relative' }}>
          <Button
            variant={post.myReaction ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowReactions((value) => !value)}
          >
            {post.myReaction ?? '★'} {post.reactionCount || ''}
          </Button>
          {showReactions ? (
            <div
              className="card card--raised"
              style={{
                position: 'absolute',
                bottom: '110%',
                left: 0,
                padding: 'var(--space-2)',
                display: 'flex',
                gap: 4,
                zIndex: 3,
              }}
            >
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="button button--ghost button--sm button--icon"
                  onClick={() => {
                    onReact(emoji);
                    setShowReactions(false);
                  }}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Button variant="ghost" size="sm" icon="message" onClick={onOpen}>
          {post.commentCount || 'Comment'}
        </Button>
      </div>

      {expanded ? <Comments postId={post.id} /> : null}
    </Card>
  );
}

function visibilityWord(visibility: string): string {
  if (visibility === 'public') return 'anyone';
  if (visibility === 'friends') return 'friends';
  return 'only you';
}

function Comments({ postId }: { postId: string }): JSX.Element {
  const dates = useDateFormat();
  const toast = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{ comments: Comment[] }>(`/api/social/flux/${postId}/comments`);
      setComments(result.comments);
    } catch {
      // The post is still readable without its comments.
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (): Promise<void> => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/social/flux/${postId}/comments`, { body: draft.trim() });
      setDraft('');
      await load();
    } catch (cause) {
      toast.fromError(cause, 'Could not post that comment');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
      {loading ? (
        <p className="tiny faint">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="tiny faint">No comments yet.</p>
      ) : (
        <div className="stack stack--tight">
          {comments.map((comment) => (
            <div key={comment.id} className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
              <Avatar name={comment.author.displayName} src={comment.author.avatarUrl || null} size={26} round />
              <div style={{ minWidth: 0 }}>
                <div className="tiny faint">
                  {comment.author.displayName} · {dates.relative(comment.postedAt)}
                </div>
                <p className="small prose" style={{ margin: 0 }}>
                  {comment.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        className="row row--nowrap"
        style={{ marginTop: 'var(--space-3)' }}
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          className="input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write a comment…"
          aria-label="Comment"
        />
        <Button variant="secondary" type="submit" disabled={!draft.trim()} loading={sending}>
          Post
        </Button>
      </form>
    </div>
  );
}

function Composer({
  dialog,
  onPosted,
}: {
  dialog: ReturnType<typeof useDialog<true>>;
  onPosted: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const toast = useToast();
  const systemMode = useSystemMode();
  const members = useCollection('members', { enabled: systemMode });

  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState('friends');
  const [contentWarning, setContentWarning] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const post = async (): Promise<void> => {
    if (!body.trim()) return;
    setPosting(true);
    try {
      await api.post('/api/social/flux', {
        body: body.trim(),
        visibility,
        contentWarning,
        authorKind: memberId ? 'member' : 'system',
        memberId,
      });
      setBody('');
      setContentWarning('');
      dialog.hide();
      onPosted();
      toast.success('Posted');
    } catch (cause) {
      toast.fromError(cause, 'Could not post that');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title={t('social.newPost')}
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void post()} disabled={!body.trim()} loading={posting}>
            Post
          </Button>
        </>
      }
    >
      <TextField label="What is happening?" value={body} onChange={setBody} multiline rows={5} autoFocus />

      {systemMode && members.items.length > 0 ? (
        <div className="field">
          <span className="field__label">{t('social.postAs')}</span>
          <div className="row">
            <Chip selected={memberId === null} onClick={() => setMemberId(null)}>
              The system
            </Chip>
            {members.items.map((member) => (
              <Chip
                key={member.id}
                selected={memberId === member.id}
                color={(member['color'] as string) ?? null}
                onClick={() => setMemberId(member.id)}
              >
                {String(member['name'])}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      <SelectField
        label="Who can see this"
        value={visibility}
        options={[
          { value: 'private', label: 'Only me' },
          { value: 'friends', label: 'Friends' },
          { value: 'public', label: 'Anyone' },
        ]}
        onChange={setVisibility}
        placeholder="Friends"
      />

      <TextField
        label="Content note"
        value={contentWarning}
        onChange={setContentWarning}
        hint="Anyone reading has to tap through before the post shows."
      />
    </Dialog>
  );
}
