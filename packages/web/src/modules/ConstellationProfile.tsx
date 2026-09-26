import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, messageFor } from '../core/api.js';
import { useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, Stat } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonCards } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * Someone else's profile.
 *
 * Everything on this page was sent by the server because the owner turned it
 * on. Anything they did not publish is absent from the response — it is not
 * fetched and hidden.
 */

interface ProfileView {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  accent: string;
  systemType: string;
  pronouns: string;
  memberSort: string;
  memberColumns: number;
  customInfo: { label: string; value: string }[] | null;
  isFriend: boolean;
  isOwner: boolean;
  acceptsFriendRequests: boolean;
  acceptsMessages: boolean;
  memberCount?: number;
  members?: {
    id: string;
    name: string;
    pronouns: string;
    color: string | null;
    icon: string | null;
    avatarUrl: string;
    orbitOrder: number;
    frontStatus: string | null;
  }[];
  currentlyFronting?: { id: string; name: string; color: string | null; icon: string | null }[];
  pinnedGallery?: { id: string; url: string; title: string; mediaType: string }[];
}

export default function ConstellationProfile(): JSX.Element {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const { term } = useI18n();
  const toast = useToast();

  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  const load = useCallback(async () => {
    if (!handle) return;
    setLoading(true);
    try {
      const result = await api.get<{ profile: ProfileView }>(`/api/social/profiles/${handle}`);
      setProfile(result.profile);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <SkeletonCards count={3} />;

  if (error || !profile) {
    return (
      <>
        <PageHeader title="Profile" />
        <Card>
          <EmptyState
            icon="constellation"
            title={error?.includes('private') ? 'This profile is private' : 'Not found'}
            body={
              error ??
              'That handle does not lead anywhere. It may have been changed, or the profile may not be discoverable.'
            }
            action={{ label: 'Back to Constellations', run: () => navigate('/constellations') }}
          />
        </Card>
      </>
    );
  }

  const members = [...(profile.members ?? [])].sort((a, b) => {
    switch (profile.memberSort) {
      case 'alphabetical':
        return a.name.localeCompare(b.name);
      case 'newest':
        return b.id.localeCompare(a.id);
      default:
        return a.orbitOrder - b.orbitOrder;
    }
  });

  return (
    <>
      <Card flush style={{ marginBottom: 'var(--space-4)', overflow: 'visible' }}>
        <div
          className="banner"
          style={{
            ['--member-color' as never]: profile.accent || 'var(--accent)',
            borderRadius: 'var(--radius) var(--radius) 0 0',
          }}
        >
          {profile.bannerUrl ? <img className="banner__image" src={profile.bannerUrl} alt="" /> : null}
          <span className="banner__scrim" />
        </div>

        <div className="banner-profile">
          <div className="banner-profile__avatar" style={{ ['--avatar-size' as never]: '80px' }}>
            <Avatar
              name={profile.displayName}
              src={profile.avatarUrl || null}
              color={profile.accent || null}
              size={80}
              round
            />
          </div>
          <div className="banner-profile__body">
            <div className="row row--between" style={{ alignItems: 'flex-start' }}>
              <div>
                <h1 style={{ fontSize: 'var(--size-xl)' }}>{profile.displayName}</h1>
                <div className="small faint">
                  @{profile.handle}
                  {profile.pronouns ? ` · ${profile.pronouns}` : ''}
                </div>
              </div>
              {!profile.isOwner ? (
                <div className="row row--nowrap">
                  {profile.isFriend ? (
                    <Chip accent>
                      <Icon name="check" size={11} /> Friends
                    </Chip>
                  ) : profile.acceptsFriendRequests ? (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={requested}
                      onClick={() => {
                        void api
                          .post('/api/social/friends/requests', { handle: profile.handle })
                          .then(() => {
                            setRequested(true);
                            toast.success('Request sent');
                          })
                          .catch((cause: unknown) => toast.fromError(cause));
                      }}
                    >
                      {requested ? 'Request sent' : 'Add friend'}
                    </Button>
                  ) : (
                    <Chip>Not accepting requests</Chip>
                  )}
                  {profile.acceptsMessages || profile.isFriend ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        void api
                          .post<{ conversation: { threadId: string } }>('/api/messages/conversations', {
                            handle: profile.handle,
                          })
                          .then((result) => navigate(`/chat/dm/${result.conversation.threadId}`))
                          .catch((cause: unknown) => toast.fromError(cause));
                      }}
                    >
                      Message
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {profile.bio ? (
              <p className="prose" style={{ marginTop: 'var(--space-3)' }}>
                {profile.bio}
              </p>
            ) : null}

            {profile.systemType ? (
              <div className="row" style={{ marginTop: 'var(--space-3)' }}>
                <Chip>{profile.systemType}</Chip>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {profile.memberCount !== undefined || profile.currentlyFronting?.length ? (
        <div className="stat-grid" style={{ marginBottom: 'var(--space-4)' }}>
          {profile.memberCount !== undefined ? (
            <Stat label={term('{{Members}}')} value={profile.memberCount} />
          ) : null}
          {profile.currentlyFronting?.length ? (
            <Stat
              label={term('{{Fronting}} now')}
              value={profile.currentlyFronting.map((member) => member.name).join(', ')}
            />
          ) : null}
        </div>
      ) : null}

      {profile.customInfo && profile.customInfo.length > 0 ? (
        <Card title="About" style={{ marginBottom: 'var(--space-4)' }}>
          <dl className="stack stack--tight" style={{ margin: 0 }}>
            {profile.customInfo.map((row) => (
              <div key={row.label} className="row row--between">
                <dt className="small muted">{row.label}</dt>
                <dd style={{ margin: 0 }}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ) : null}

      {profile.pinnedGallery && profile.pinnedGallery.length > 0 ? (
        <Card title="Gallery" style={{ marginBottom: 'var(--space-4)' }}>
          <div className="grid grid--tight" style={{ ['--grid-min' as never]: '120px' }}>
            {profile.pinnedGallery.map((item) => (
              <img
                key={item.id}
                src={item.url}
                alt={item.title || ''}
                loading="lazy"
                style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
              />
            ))}
          </div>
        </Card>
      ) : null}

      {members.length > 0 ? (
        <Card title={term('{{Members}}')} subtitle={`Shown in ${profile.memberSort} order`}>
          <div
            className="grid"
            style={{ ['--grid-min' as never]: `${Math.max(110, 560 / profile.memberColumns)}px` }}
          >
            {members.map((member) => (
              <div
                key={member.id}
                className="card"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3)' }}
              >
                <Avatar
                  name={member.name}
                  src={member.avatarUrl || null}
                  color={member.color}
                  icon={member.icon}
                  size={52}
                  round
                  ring={member.frontStatus === 'fronting'}
                />
                <span className="small truncate" style={{ maxWidth: '100%' }}>
                  {member.name}
                </span>
                {member.pronouns ? (
                  <span className="tiny faint truncate" style={{ maxWidth: '100%' }}>
                    {member.pronouns}
                  </span>
                ) : null}
                {member.frontStatus === 'fronting' ? <Chip accent>Out now</Chip> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="small muted prose">
            {term(
              'This {{system}} has not published a {{member}} list. That is a choice they made, not something missing.',
            )}
          </p>
        </Card>
      )}
    </>
  );
}
