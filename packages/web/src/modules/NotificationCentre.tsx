import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS } from '@pluralnova/shared';
import { api, messageFor } from '../core/api.js';
import { realtime } from '../core/realtime.js';
import { refreshBadges } from '../core/badges.js';
import { useDateFormat, useI18n } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Button, Card, Chip, Dot, IconButton } from '../ui/primitives.js';
import { EmptyState, ErrorPanel, SkeletonList } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

/**
 * The notification centre.
 *
 * Everything that happened while you were elsewhere, filterable by category and
 * clearing its badge as it is read. What arrives here is decided by the same
 * preferences that govern push, so a category switched off is absent rather
 * than silently delivered.
 */

interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string;
  category: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}

const ICONS: Record<string, 'message' | 'friend' | 'flux' | 'chat' | 'poll' | 'calendar' | 'task' | 'front' | 'mood' | 'achievement' | 'member' | 'backup' | 'notification'> = {
  messages: 'message',
  friendRequests: 'friend',
  fluxActivity: 'flux',
  systemChat: 'chat',
  polls: 'poll',
  events: 'calendar',
  tasks: 'task',
  fronting: 'front',
  mood: 'mood',
  achievements: 'achievement',
  memberActivity: 'member',
  dataJobs: 'backup',
};

export default function NotificationCentre(): JSX.Element {
  const navigate = useNavigate();
  const { t } = useI18n();
  const dates = useDateFormat();
  const toast = useToast();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [unread, setUnread] = useState(0);
  const [category, setCategory] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.get<{
        notifications: Notification[];
        unread: number;
        byCategory: Record<string, number>;
      }>('/api/notifications', {
        ...(category ? { category } : {}),
        ...(unreadOnly ? { unread: 'true' } : {}),
        limit: 100,
      });
      setNotifications(result.notifications);
      setUnread(result.unread);
      setByCategory(result.byCategory);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setLoading(false);
    }
  }, [category, unreadOnly]);

  useEffect(() => {
    void load();
    return realtime.on((event) => {
      if (event.type === 'notification.new') void load();
    });
  }, [load]);

  const markRead = async (ids: string[]): Promise<void> => {
    try {
      await api.post('/api/notifications/read', { ids });
      void refreshBadges();
      await load();
    } catch (cause) {
      toast.fromError(cause, 'Could not mark that as read');
    }
  };

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        description={unread > 0 ? `${unread} unread` : 'Everything is read.'}
        actions={
          <>
            {unread > 0 ? (
              <Button
                variant="secondary"
                icon="check"
                onClick={() => {
                  void api
                    .post('/api/notifications/read', { all: true })
                    .then(() => {
                      void refreshBadges();
                      void load();
                      toast.success('All marked as read');
                    })
                    .catch((cause: unknown) => toast.fromError(cause, 'Could not mark everything as read'));
                }}
              >
                {t('notifications.markAllRead')}
              </Button>
            ) : null}
            <Button variant="ghost" icon="settings" onClick={() => navigate('/settings/notifications')}>
              {t('notifications.settings')}
            </Button>
          </>
        }
      />

      <div className="row" style={{ marginBottom: 'var(--space-4)' }}>
        <Chip selected={category === null} onClick={() => setCategory(null)}>
          Everything
        </Chip>
        {NOTIFICATION_CATEGORIES.filter((name) => byCategory[name]).map((name) => (
          <Chip key={name} selected={category === name} onClick={() => setCategory(name)}>
            {NOTIFICATION_CATEGORY_LABELS[name]} · {byCategory[name]}
          </Chip>
        ))}
        <span className="spacer" />
        <Chip selected={unreadOnly} onClick={() => setUnreadOnly((value) => !value)}>
          Unread only
        </Chip>
      </div>

      {loading ? (
        <SkeletonList rows={5} />
      ) : error ? (
        <ErrorPanel message={error} onRetry={() => void load()} />
      ) : notifications.length === 0 ? (
        <Card>
          <EmptyState
            icon="notification"
            title={t('notifications.empty')}
            body={t('notifications.emptyBody')}
          />
        </Card>
      ) : (
        <Card flush>
          <div className="list">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                className="list-row"
                style={{
                  background: notification.readAt ? undefined : 'var(--accent-soft)',
                }}
                onClick={() => {
                  if (!notification.readAt) void markRead([notification.id]);
                  if (notification.link) navigate(notification.link);
                }}
              >
                <span style={{ color: notification.readAt ? 'var(--text-faint)' : 'var(--accent)' }}>
                  <Icon name={ICONS[notification.category] ?? 'notification'} size={18} />
                </span>
                <span className="list-row__body">
                  <span className="list-row__title">{notification.title}</span>
                  <span className="list-row__meta">
                    {notification.body ? <span className="truncate">{notification.body}</span> : null}
                    <span className="faint">{dates.relative(notification.createdAt)}</span>
                  </span>
                </span>
                <span className="list-row__trailing">
                  {!notification.readAt ? <Dot label="Unread" /> : null}
                  <IconButton
                    icon="close"
                    label="Dismiss"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      void api
                        .delete(`/api/notifications/${notification.id}`)
                        .then(() => {
                          void refreshBadges();
                          void load();
                        })
                        .catch((cause: unknown) => toast.fromError(cause, 'Could not dismiss that'));
                    }}
                  />
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      {notifications.some((notification) => notification.readAt) ? (
        <div className="row" style={{ marginTop: 'var(--space-4)', justifyContent: 'center' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void api
                .delete('/api/notifications')
                .then(() => {
                  toast.success('Cleared read notifications');
                  void load();
                })
                .catch((cause: unknown) => toast.fromError(cause, 'Could not clear those'));
            }}
          >
            Clear the ones already read
          </Button>
        </div>
      ) : null}
    </>
  );
}
