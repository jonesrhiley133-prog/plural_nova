import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, messageFor } from '../core/api.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Card, IconButton } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, useDialog } from '../ui/overlays.js';
import { PostCard, QuoteDialog, type Post } from './Flux.js';

/**
 * Posts saved from Flux. A thin list screen over the same `PostCard` the main
 * feed renders, so a bookmarked post looks and behaves identically here —
 * the only thing this page adds is where the posts come from.
 */
export default function Bookmarks(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const confirm = useDialog<Post>();
  const quoting = useDialog<Post>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<{ posts: Post[] }>('/api/social/flux/bookmarks');
      setPosts(result.posts);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const react = async (post: Post, emoji: string): Promise<void> => {
    try {
      const result = await api.post<{ emoji: string | null }>(`/api/social/flux/${post.id}/reactions`, { emoji });
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

  // Un-bookmarking here means the post no longer belongs on this page at
  // all, unlike the main feed where the same toggle just flips an icon.
  const toggleBookmark = async (post: Post): Promise<void> => {
    try {
      await api.post(`/api/social/flux/${post.id}/bookmark`);
      setPosts((current) => current.filter((candidate) => candidate.id !== post.id));
    } catch (cause) {
      toast.fromError(cause, 'Could not update that');
    }
  };

  const repost = async (post: Post, quoteBody?: string): Promise<void> => {
    try {
      await api.post('/api/social/flux', { repostOfId: post.id, body: quoteBody ?? '', visibility: 'friends' });
      toast.success(quoteBody ? 'Quoted' : 'Reposted');
    } catch (cause) {
      toast.fromError(cause, 'Could not repost that');
    }
  };

  return (
    <>
      <PageHeader
        title="Bookmarks"
        description="Posts you saved to find again later."
        actions={<IconButton icon="chevronLeft" label="Back to Flux" variant="ghost" onClick={() => navigate('/flux')} />}
      />

      {loading && posts.length === 0 ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState
            icon="bookmark"
            title="Nothing saved yet"
            body="Bookmark a post from Flux to find it here later."
            action={{ label: 'Open Flux', run: () => navigate('/flux') }}
          />
        </Card>
      ) : (
        <div className="stack">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onReact={(emoji) => void react(post, emoji)}
              onToggleBookmark={() => void toggleBookmark(post)}
              onRepost={() => void repost(post)}
              onQuote={() => quoting.show(post)}
              onDelete={() => confirm.show(post)}
              onOpen={() => navigate(`/flux/${post.id}`)}
              expanded={false}
            />
          ))}
        </div>
      )}

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
