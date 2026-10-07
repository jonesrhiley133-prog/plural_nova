import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, messageFor } from '../core/api.js';
import { realtime } from '../core/realtime.js';
import { useCollection } from '../core/data.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { useSystemMode } from '../core/auth.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, SegmentedControl } from '../ui/primitives.js';
import { GalleryField, SelectField, TextField } from '../ui/forms.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ActionMenu, ConfirmDialog, Dialog, useActionMenu, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';
import { Markdown } from '../ui/Markdown.js';

/**
 * Flux.
 *
 * A feed of the systems you are friends with. Posting as the system or as one
 * member is a first-class choice rather than a workaround, and visibility is
 * set per post — a post is never more visible than it was written to be.
 */

interface PostAuthor {
  userId: string;
  displayName: string;
  avatarUrl: string;
  accent: string;
  handle: string | null;
}

interface PostAsMember {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  avatarUrl: string;
}

/** What a repost embeds of the post it points to — enough to render a compact card, nothing interactive. */
interface RepostedPost {
  id: string;
  body: string;
  postedAt: string;
  media: { url: string; alt?: string }[];
  author: PostAuthor;
  asMember: PostAsMember | null;
}

export interface Post {
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
  repostOfId: string | null;
  /** Null both when this is not a repost and when the original is gone or no longer visible. */
  repostOf: RepostedPost | null;
  bookmarked: boolean;
  tags: string[];
  edited: boolean;
  contentWarning: string;
  isMine: boolean;
  myReaction: string | null;
  author: PostAuthor;
  asMember: PostAsMember | null;
}

interface Comment {
  id: string;
  body: string;
  postedAt: string;
  isMine: boolean;
  replyToId: string | null;
  author: { displayName: string; avatarUrl: string };
}

const REACTIONS = ['★', '♡', '✧', '☾', '◍', '✓'];

export default function Flux(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, term } = useI18n();
  const toast = useToast();

  const [scope, setScope] = useState<'friends' | 'mine' | 'public'>('friends');
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const composer = useDialog();
  const confirm = useDialog<Post>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<{ posts: Post[]; nextCursor: string | null }>('/api/social/flux', { scope });
      setPosts(result.posts);
      setNextCursor(result.nextCursor);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [scope]);

  const loadMore = async (): Promise<void> => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const result = await api.get<{ posts: Post[]; nextCursor: string | null }>('/api/social/flux', {
        scope,
        before: nextCursor,
      });
      setPosts((current) => [...current, ...result.posts]);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      toast.fromError(cause, 'Could not load more posts');
    } finally {
      setLoadingMore(false);
    }
  };

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

  const toggleBookmark = async (post: Post): Promise<void> => {
    try {
      const result = await api.post<{ bookmarked: boolean }>(`/api/social/flux/${post.id}/bookmark`);
      setPosts((current) =>
        current.map((candidate) => (candidate.id === post.id ? { ...candidate, bookmarked: result.bookmarked } : candidate)),
      );
    } catch (cause) {
      toast.fromError(cause, 'Could not save that');
    }
  };

  const repost = async (post: Post, quoteBody?: string): Promise<void> => {
    try {
      await api.post('/api/social/flux', { repostOfId: post.id, body: quoteBody ?? '', visibility: 'friends' });
      // A repost is a new post of your own, not just a counter on the old one
      // — only a reload puts it where you'd actually look for it afterward.
      await load();
      toast.success(quoteBody ? 'Quoted' : 'Reposted');
    } catch (cause) {
      toast.fromError(cause, 'Could not repost that');
    }
  };

  const quoting = useDialog<Post>();

  const single = id ? posts.find((post) => post.id === id) : null;

  return (
    <>
      <PageHeader
        title="Flux"
        description={term('Posts from you and the {{systems}} you are friends with.')}
        actions={
          <>
            <IconButton icon="bookmark" label="Bookmarks" variant="ghost" onClick={() => navigate('/flux/bookmarks')} />
            <Button variant="primary" icon="plus" onClick={() => composer.show()}>
              {t('social.newPost')}
            </Button>
          </>
        }
      />

      <div style={{ marginBottom: 'var(--space-4)' }}>
        <SegmentedControl
          value={scope}
          onChange={setScope}
          label="Feed"
          options={[
            { value: 'friends', label: 'Friends' },
            { value: 'mine', label: 'Mine' },
            { value: 'public', label: 'Public' },
          ]}
        />
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
            secondaryAction={{ label: term('Find {{systems}}'), run: () => navigate('/constellations') }}
          />
        </Card>
      ) : (
        <div className="stack">
          {(single ? [single] : posts).map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onReact={(emoji) => void react(post, emoji)}
              onToggleBookmark={() => void toggleBookmark(post)}
              onRepost={() => void repost(post)}
              onQuote={() => quoting.show(post)}
              onDelete={() => confirm.show(post)}
              onOpen={() => navigate(`/flux/${post.id}`)}
              expanded={Boolean(single)}
            />
          ))}
        </div>
      )}

      {!single && nextCursor ? (
        <div className="row" style={{ marginTop: 'var(--space-4)', justifyContent: 'center' }}>
          <Button variant="ghost" onClick={() => void loadMore()} loading={loadingMore}>
            Load more
          </Button>
        </div>
      ) : null}

      {single ? (
        <div className="row" style={{ marginTop: 'var(--space-4)' }}>
          <Button variant="ghost" icon="chevronLeft" onClick={() => navigate('/flux')}>
            Back to the feed
          </Button>
        </div>
      ) : null}

      <Composer dialog={composer} onPosted={() => void load()} />

      <QuoteDialog
        dialog={quoting}
        onQuote={(body) => {
          if (!quoting.value) return;
          void repost(quoting.value, body);
        }}
      />

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

export function PostCard({
  post,
  onReact,
  onToggleBookmark,
  onRepost,
  onQuote,
  onDelete,
  onOpen,
  expanded,
}: {
  post: Post;
  onReact: (emoji: string) => void;
  onToggleBookmark: () => void;
  onRepost: () => void;
  onQuote: () => void;
  onDelete: () => void;
  onOpen: () => void;
  expanded: boolean;
}): JSX.Element {
  const dates = useDateFormat();
  const [showWarned, setShowWarned] = useState(!post.contentWarning);
  const [showReactions, setShowReactions] = useState(false);
  const repostMenu = useActionMenu();

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
            <Markdown text={post.body} className={expanded ? undefined : 'clamp-3'} style={{ marginTop: 'var(--space-3)' }} />
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

          {post.repostOfId ? (
            post.repostOf ? (
              <div
                className="card"
                style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', borderStyle: 'dashed' }}
              >
                <div className="row row--nowrap" style={{ minWidth: 0 }}>
                  <Avatar
                    name={post.repostOf.asMember?.name ?? post.repostOf.author.displayName}
                    src={post.repostOf.asMember?.avatarUrl || post.repostOf.author.avatarUrl || null}
                    color={post.repostOf.asMember?.color ?? post.repostOf.author.accent ?? null}
                    icon={post.repostOf.asMember?.icon ?? null}
                    size={24}
                    round
                  />
                  <div className="tiny" style={{ fontWeight: 'var(--weight-medium)' }}>
                    {post.repostOf.asMember?.name ?? post.repostOf.author.displayName}
                  </div>
                </div>
                {post.repostOf.body ? (
                  <Markdown text={post.repostOf.body} className="small clamp-3" style={{ marginTop: 'var(--space-2)' }} />
                ) : null}
                {post.repostOf.media[0] ? (
                  <img
                    src={post.repostOf.media[0].url}
                    alt={post.repostOf.media[0].alt ?? ''}
                    loading="lazy"
                    style={{
                      width: '100%',
                      maxHeight: 160,
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                      marginTop: 'var(--space-2)',
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <p className="tiny faint" style={{ marginTop: 'var(--space-3)' }}>
                Original post unavailable.
              </p>
            )
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

        <Button variant="ghost" size="sm" icon="repeat" onClick={(event) => repostMenu.openFrom(event)}>
          {post.repostCount || 'Repost'}
        </Button>
        <ActionMenu
          position={repostMenu.position}
          onClose={repostMenu.close}
          items={[
            { key: 'repost', label: 'Repost', icon: 'repeat', onSelect: onRepost },
            { key: 'quote', label: 'Quote', icon: 'create', onSelect: onQuote },
          ]}
        />

        <IconButton
          icon="bookmark"
          label={post.bookmarked ? 'Remove bookmark' : 'Bookmark'}
          variant={post.bookmarked ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleBookmark}
        />
      </div>

      {expanded ? <Comments postId={post.id} /> : null}
    </Card>
  );
}

export function QuoteDialog({
  dialog,
  onQuote,
}: {
  dialog: ReturnType<typeof useDialog<Post>>;
  onQuote: (body: string) => void;
}): JSX.Element {
  const [body, setBody] = useState('');

  return (
    <Dialog
      open={dialog.open}
      onClose={dialog.hide}
      title="Quote this post"
      footer={
        <>
          <Button variant="ghost" onClick={dialog.hide}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onQuote(body.trim());
              setBody('');
              dialog.hide();
            }}
          >
            Post
          </Button>
        </>
      }
    >
      <TextField label="Add your own words" value={body} onChange={setBody} multiline rows={3} autoFocus />
      {dialog.value ? (
        <p className="tiny faint" style={{ marginTop: 'var(--space-2)' }}>
          Quoting {dialog.value.asMember?.name ?? dialog.value.author.displayName}
          {dialog.value.body ? `: “${dialog.value.body.slice(0, 80)}${dialog.value.body.length > 80 ? '…' : ''}”` : ''}
        </p>
      ) : null}
    </Dialog>
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
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
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

  const byId = new Map(comments.map((comment) => [comment.id, comment]));

  const send = async (): Promise<void> => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/social/flux/${postId}/comments`, { body: draft.trim(), replyToId: replyTo?.id ?? null });
      setDraft('');
      setReplyTo(null);
      await load();
    } catch (cause) {
      toast.fromError(cause, 'Could not post that comment');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginTop: 'var(--space-4)', borderTop: 'var(--border-width) solid var(--border)', paddingTop: 'var(--space-3)' }}>
      {loading ? (
        <p className="tiny faint">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="tiny faint">No comments yet.</p>
      ) : (
        <div className="stack stack--tight">
          {comments.map((comment) => {
            const repliedTo = comment.replyToId ? byId.get(comment.replyToId) ?? null : null;
            return (
              <div key={comment.id} className="row row--nowrap" style={{ alignItems: 'flex-start' }}>
                <Avatar name={comment.author.displayName} src={comment.author.avatarUrl || null} size={26} round />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="tiny faint">
                    {comment.author.displayName} · {dates.relative(comment.postedAt)}
                  </div>
                  {comment.replyToId ? (
                    <div className="tiny faint">↳ replying to {repliedTo?.author.displayName ?? 'a comment since removed'}</div>
                  ) : null}
                  <Markdown text={comment.body} className="small" />
                  <button
                    type="button"
                    className="tiny faint"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    onClick={() => setReplyTo(comment)}
                  >
                    Reply
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {replyTo ? (
        <div className="row row--between tiny faint" style={{ marginTop: 'var(--space-3)' }}>
          <span>Replying to {replyTo.author.displayName}</span>
          <button
            type="button"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit' }}
            onClick={() => setReplyTo(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}

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
          placeholder={replyTo ? `Reply to ${replyTo.author.displayName}…` : 'Write a comment…'}
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
  const { t, term } = useI18n();
  const toast = useToast();
  const systemMode = useSystemMode();
  const members = useCollection('members', { enabled: systemMode });

  const [body, setBody] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [visibility, setVisibility] = useState('friends');
  const [contentWarning, setContentWarning] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const canPost = Boolean(body.trim()) || media.length > 0;

  const post = async (): Promise<void> => {
    if (!canPost) return;
    setPosting(true);
    try {
      await api.post('/api/social/flux', {
        body: body.trim(),
        media: media.map((url) => ({ url })),
        visibility,
        contentWarning,
        authorKind: memberId ? 'member' : 'system',
        memberId,
      });
      setBody('');
      setMedia([]);
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
          <Button variant="primary" onClick={() => void post()} disabled={!canPost} loading={posting}>
            Post
          </Button>
        </>
      }
    >
      <TextField label="What is happening?" value={body} onChange={setBody} multiline rows={5} autoFocus />

      <GalleryField label="Photos" value={media} onChange={setMedia} hint="Optional — snap a photo or pick one from your media library." />

      {systemMode && members.items.length > 0 ? (
        <div className="field">
          <span className="field__label">{t('social.postAs')}</span>
          <div className="row">
            <Chip selected={memberId === null} onClick={() => setMemberId(null)}>
              {term('The {{system}}')}
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
