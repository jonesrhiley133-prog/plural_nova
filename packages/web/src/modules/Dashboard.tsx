import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DASHBOARD_WIDGETS,
  dayKey,
  formatDuration,
  getEmotion,
  type StoredRecord,
  type WidgetSetting,
} from '@pluralnova/shared';
import { useAuth, useSystemMode } from '../core/auth.js';
import { useCollection, useQuery } from '../core/data.js';
import { useI18n, useDateFormat } from '../core/i18n.js';
import { useOptimisticSettings } from '../core/settings.js';
import { useBadges } from '../core/badges.js';
import { useFronting } from '../core/fronting.js';
import { useToast } from '../core/toast.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, ListRow, Stat } from '../ui/primitives.js';
import { EmptyState, ErrorLine, LoadingLine, SkeletonCards } from '../ui/feedback.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { Switch } from '../ui/forms.js';
import { Sparkline } from '../charts/index.js';
import { Icon } from '../ui/Icon.js';

/**
 * The dashboard.
 *
 * Widgets the user chooses and orders. Each one is small, answers one question,
 * and links to the screen that answers it properly — the dashboard's job is to
 * make the next tap obvious, not to be every screen at once.
 */
export default function Dashboard(): JSX.Element {
  const { user } = useAuth();
  const { settings, update: updateSettings } = useOptimisticSettings();
  const { t, term } = useI18n();
  const systemMode = useSystemMode();
  const customiser = useDialog();

  const visible = useMemo(
    () =>
      [...settings.widgets]
        .filter((widget) => widget.visible)
        .filter((widget) => systemMode || !isSystemWidget(widget.id))
        .sort((a, b) => a.order - b.order),
    [settings.widgets, systemMode],
  );

  return (
    <>
      <PageHeader
        title={t('dashboard.greeting', { name: user?.displayName ?? 'there' })}
        description={new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        actions={
          <Button variant="ghost" icon="settings" onClick={() => customiser.show()}>
            {t('dashboard.customise')}
          </Button>
        }
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="home"
            title={t('dashboard.noWidgets')}
            body="Pick what you want to see when you open PluralNova."
            action={{ label: t('dashboard.customise'), run: () => customiser.show() }}
          />
        </Card>
      ) : (
        <div className="grid" style={{ ['--grid-min' as never]: '280px' }}>
          {visible.map((widget) => (
            <Widget key={widget.id} id={widget.id} />
          ))}
        </div>
      )}

      <Dialog
        open={customiser.open}
        onClose={customiser.hide}
        title={t('dashboard.customise')}
        description="Choose what appears, and drag the arrows to reorder."
      >
        <WidgetEditor
          widgets={settings.widgets}
          systemMode={systemMode}
          onChange={(widgets) => updateSettings({ widgets })}
        />
      </Dialog>

      <p className="tiny faint" style={{ marginTop: 'var(--space-6)', textAlign: 'center' }}>
        {term('PluralNova — a private constellation for your {{system}}.')}
      </p>
    </>
  );
}

function isSystemWidget(id: string): boolean {
  return DASHBOARD_WIDGETS.some(
    (widget) => widget.id === id && 'systemOnly' in widget && widget.systemOnly,
  );
}

function Widget({ id }: { id: string }): JSX.Element | null {
  switch (id) {
    case 'current-front':
      return <CurrentFrontWidget />;
    case 'quick-front':
      return <QuickFrontWidget />;
    case 'quick-actions':
      return <QuickActionsWidget />;
    case 'mood':
      return <MoodWidget />;
    case 'system-status':
      return <SystemStatusWidget />;
    case 'recent-journal':
      return <JournalWidget />;
    case 'tasks':
      return <TasksWidget />;
    case 'calendar':
      return <CalendarWidget />;
    case 'sleep':
      return <SleepWidget />;
    case 'wellness':
      return <WellnessWidget />;
    case 'notifications':
      return <NotificationsWidget />;
    case 'messages':
      return <MessagesWidget />;
    case 'friends':
      return <FriendsWidget />;
    case 'daily-summary':
      return <DailySummaryWidget />;
    case 'music':
      return <MusicWidget />;
    case 'headspace':
      return <HeadspaceWidget />;
    case 'fronting-stats':
      return <FrontingStatsWidget />;
    case 'location':
      return <LocationWidget />;
    default:
      return null;
  }
}

function CurrentFrontWidget(): JSX.Element {
  const { t, term } = useI18n();
  const dates = useDateFormat();
  const navigate = useNavigate();
  const { state, loading } = useFronting();

  return (
    <Card
      title={t('front.current')}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/whos-there')}>
          {t('action.viewAll')}
        </Button>
      }
    >
      {loading ? (
        <SkeletonCards count={1} />
      ) : state.active.length === 0 ? (
        <div className="stack stack--tight">
          <p className="small muted">{t('front.noOne')}</p>
          <Button variant="secondary" size="sm" icon="bolt" onClick={() => navigate('/quick-front')}>
            {t('front.start')}
          </Button>
        </div>
      ) : (
        <div className="stack stack--tight">
          <div className="front-row">
            {state.active.map((event) => (
              <button
                key={event.id}
                type="button"
                className="front-person"
                onClick={() => navigate('/whos-there')}
              >
                <Avatar
                  name={String(event.member?.['name'] ?? t('front.unknown'))}
                  src={(event.member?.['avatarUrl'] as string) ?? null}
                  color={(event.member?.['color'] as string) ?? null}
                  icon={(event.member?.['icon'] as string) ?? null}
                  size={58}
                  round
                  ring
                />
                <span className="front-person__name">
                  {String(event.member?.['name'] ?? t('front.unknown'))}
                </span>
                <span className="front-person__since">{formatDuration(event.minutes)}</span>
              </button>
            ))}
          </div>
          <p className="tiny faint">
            {t('front.since', { time: dates.time(String(state.active[0]?.['startedAt'] ?? '')) })} ·{' '}
            {term('tap someone to end or change the {{front}}.')}
          </p>
        </div>
      )}
    </Card>
  );
}

function QuickFrontWidget(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();
  const members = useCollection('members', {
    sort: (a, b) => Number(b['frontCount'] ?? 0) - Number(a['frontCount'] ?? 0),
    limit: 6,
  });
  const { start } = useFronting();
  const toast = useToast();

  return (
    <Card title={term('Quick {{front}}')} subtitle={term('One tap to record who is out')}>
      {members.loading ? (
        <LoadingLine label={term('Loading {{members}}…')} />
      ) : members.error ? (
        <ErrorLine message={members.error} />
      ) : members.items.length === 0 ? (
        <p className="small faint">{term('Add a {{member}} to use this.')}</p>
      ) : (
        <div className="row">
          {members.items.map((member) => (
            <button
              key={member.id}
              type="button"
              className="chip chip--interactive"
              onClick={() => {
                void start({ memberId: member.id, endOthers: true })
                  .then(() => toast.success(`${String(member['name'])} ${term('is {{fronting}}')}`))
                  .catch((cause: unknown) => toast.fromError(cause));
              }}
            >
              <Avatar
                name={String(member['name'])}
                color={(member['color'] as string) ?? null}
                icon={(member['icon'] as string) ?? null}
                size={18}
                round
              />
              {String(member['name'])}
            </button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => navigate('/quick-front')}>
            More…
          </Button>
        </div>
      )}
    </Card>
  );
}

function QuickActionsWidget(): JSX.Element {
  const navigate = useNavigate();
  const { t, term } = useI18n();
  const systemMode = useSystemMode();

  const actions = [
    { icon: 'journal' as const, label: term('New {{journal}} entry'), path: '/journal?new=1' },
    { icon: 'emotion' as const, label: 'Log an emotion', path: '/emotions?new=1' },
    { icon: 'note' as const, label: 'New note', path: '/notes?new=1' },
    { icon: 'task' as const, label: 'New task', path: '/tasks?new=1' },
    ...(systemMode ? [{ icon: 'front' as const, label: term('Log a {{front}}'), path: '/quick-front' }] : []),
  ];

  return (
    <Card title={t('dashboard.quickActions')} flush>
      <div className="list">
        {actions.map((action) => (
          <ListRow
            key={action.path}
            leading={
              <span className="list-row__icon">
                <Icon name={action.icon} size={17} />
              </span>
            }
            title={action.label}
            trailing={<Icon name="chevronRight" size={14} />}
            onClick={() => navigate(action.path)}
          />
        ))}
      </div>
    </Card>
  );
}

function MoodWidget(): JSX.Element {
  const navigate = useNavigate();
  const dates = useDateFormat();
  const moods = useCollection('moodEntries', { limit: 14 });
  const latest = moods.items[0];

  return (
    <Card
      title="Mood"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/wellbeing')}>
          Log
        </Button>
      }
    >
      {moods.loading ? (
        <LoadingLine label="Loading mood…" />
      ) : moods.error ? (
        <ErrorLine message={moods.error} />
      ) : !latest ? (
        <p className="small faint">Nothing logged yet. A one-word answer counts.</p>
      ) : (
        <div className="row row--between">
          <div>
            <div style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-semibold)' }}>
              {String(latest['label'])}
            </div>
            <div className="tiny faint">{dates.relative(String(latest['recordedAt']))}</div>
          </div>
          <Sparkline
            values={[...moods.items].reverse().map((entry) => Number(entry['score'] ?? 5))}
            label="Mood over the last few entries"
          />
        </div>
      )}
    </Card>
  );
}

function SystemStatusWidget(): JSX.Element {
  const { term } = useI18n();
  const members = useCollection('members');
  const subsystems = useCollection('subsystems');

  const byStatus = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of members.items) {
      const key = String(member['frontStatus'] ?? 'nearby');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [members.items]);

  const loading = members.loading || subsystems.loading;
  const error = members.error ?? subsystems.error;

  return (
    <Card title={term('{{System}} status')}>
      {loading ? (
        <LoadingLine label={term('Loading {{system}} status…')} />
      ) : error ? (
        <ErrorLine message={error} />
      ) : (
        <>
          <div className="stat-grid">
            <Stat label={term('{{Members}}')} value={members.items.length} />
            <Stat label={term('{{Subsystems}}')} value={subsystems.items.length} />
          </div>
          <div className="row" style={{ marginTop: 'var(--space-3)' }}>
            {byStatus.map(([status, count]) => (
              <Chip key={status}>
                {status}: {count}
              </Chip>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function JournalWidget(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();
  const dates = useDateFormat();
  const entries = useCollection('journalEntries', { limit: 3 });

  return (
    <Card
      title={term('Recent {{journal}}')}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/journal')}>
          Open
        </Button>
      }
    >
      {entries.loading ? (
        <LoadingLine label={term('Loading {{journal}}…')} />
      ) : entries.error ? (
        <ErrorLine message={entries.error} />
      ) : entries.items.length === 0 ? (
        <p className="small faint">{term('Nothing written yet. The first entry can be one line.')}</p>
      ) : (
        <div className="stack stack--tight">
          {entries.items.map((entry) => (
            <Link
              key={entry.id}
              to="/journal"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="truncate small" style={{ fontWeight: 'var(--weight-medium)' }}>
                {String(entry['title'] || 'Untitled')}
              </div>
              <div className="tiny faint">{dates.relative(String(entry['entryDate']))}</div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

function TasksWidget(): JSX.Element {
  const navigate = useNavigate();
  const dates = useDateFormat();
  const { items, update, loading, error } = useCollection('tasks', {
    filter: (task) => task['completed'] !== true && task['archived'] !== true,
    sort: (a, b) => String(a['dueAt'] ?? '9999').localeCompare(String(b['dueAt'] ?? '9999')),
    limit: 5,
  });

  const overdue = items.filter(
    (task) => typeof task['dueAt'] === 'string' && task['dueAt'] < new Date().toISOString(),
  );

  return (
    <Card
      title="Tasks"
      subtitle={overdue.length > 0 ? `${overdue.length} overdue` : undefined}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
          Open
        </Button>
      }
    >
      {loading ? (
        <LoadingLine label="Loading tasks…" />
      ) : error ? (
        <ErrorLine message={error} />
      ) : items.length === 0 ? (
        <p className="small faint">Nothing due. That is allowed.</p>
      ) : (
        <div className="stack stack--tight">
          {items.map((task) => (
            <label key={task.id} className="row row--nowrap" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={false}
                onChange={() => {
                  void update(task.id, { completed: true, completedAt: new Date().toISOString() });
                }}
                aria-label={`Mark ${String(task['title'])} complete`}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="small truncate" style={{ flex: 1 }}>
                {String(task['title'])}
              </span>
              {task['dueAt'] ? (
                <span className="tiny faint">{dates.date(String(task['dueAt']))}</span>
              ) : null}
            </label>
          ))}
        </div>
      )}
    </Card>
  );
}

function CalendarWidget(): JSX.Element {
  const navigate = useNavigate();
  const dates = useDateFormat();
  const today = dayKey(new Date());
  const events = useCollection('calendarEvents', {
    filter: (event) => dayKey(String(event['startsAt'])) === today,
    sort: (a, b) => String(a['startsAt']).localeCompare(String(b['startsAt'])),
  });

  return (
    <Card
      title="Today"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/calendar')}>
          Calendar
        </Button>
      }
    >
      {events.loading ? (
        <LoadingLine label="Loading today…" />
      ) : events.error ? (
        <ErrorLine message={events.error} />
      ) : events.items.length === 0 ? (
        <p className="small faint">Nothing scheduled today.</p>
      ) : (
        <div className="stack stack--tight">
          {events.items.map((event) => (
            <div key={event.id} className="row row--nowrap">
              <span className="tiny numeric faint" style={{ minWidth: 52 }}>
                {event['allDay'] === true ? 'All day' : dates.time(String(event['startsAt']))}
              </span>
              <span className="small truncate">{String(event['title'])}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SleepWidget(): JSX.Element {
  const navigate = useNavigate();
  const entries = useCollection('sleepEntries', { limit: 7 });
  const latest = entries.items[0];

  return (
    <Card
      title="Sleep"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/sleep')}>
          Log
        </Button>
      }
    >
      {entries.loading ? (
        <LoadingLine label="Loading sleep…" />
      ) : entries.error ? (
        <ErrorLine message={entries.error} />
      ) : !latest ? (
        <p className="small faint">No sleep logged yet.</p>
      ) : (
        <div className="row row--between">
          <div>
            <div style={{ fontSize: 'var(--size-lg)', fontWeight: 'var(--weight-semibold)' }}>
              {formatDuration(Number(latest['durationMinutes'] ?? 0))}
            </div>
            <div className="tiny faint">
              Last night{latest['quality'] ? ` · quality ${String(latest['quality'])}/5` : ''}
            </div>
          </div>
          <Sparkline
            values={[...entries.items].reverse().map((entry) => Number(entry['durationMinutes'] ?? 0))}
            label="Sleep over the last week"
          />
        </div>
      )}
    </Card>
  );
}

function WellnessWidget(): JSX.Element {
  const navigate = useNavigate();
  const entries = useCollection('wellnessEntries', { limit: 1 });
  const latest = entries.items[0];

  return (
    <Card
      title="Wellbeing"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/wellbeing')}>
          Check in
        </Button>
      }
    >
      {entries.loading ? (
        <LoadingLine label="Loading wellbeing…" />
      ) : entries.error ? (
        <ErrorLine message={entries.error} />
      ) : !latest ? (
        <p className="small faint">No check-in yet today.</p>
      ) : (
        <div className="stat-grid">
          {latest['energy'] ? <Stat label="Energy" value={`${String(latest['energy'])}/10`} /> : null}
          {latest['stress'] ? <Stat label="Stress" value={`${String(latest['stress'])}/10`} /> : null}
        </div>
      )}
    </Card>
  );
}

function NotificationsWidget(): JSX.Element {
  const navigate = useNavigate();
  const badges = useBadges();

  return (
    <Card
      title="Notifications"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/notifications')}>
          Open
        </Button>
      }
    >
      {badges.total === 0 ? (
        <p className="small faint">Nothing new.</p>
      ) : (
        <div className="row">
          {badges.notifications > 0 ? <Chip accent>{badges.notifications} unread</Chip> : null}
          {badges.messages > 0 ? <Chip accent>{badges.messages} messages</Chip> : null}
          {badges.friendRequests > 0 ? <Chip accent>{badges.friendRequests} requests</Chip> : null}
        </div>
      )}
    </Card>
  );
}

function MessagesWidget(): JSX.Element {
  const navigate = useNavigate();
  const conversations = useQuery<{ conversations: { threadId: string; counterpart: { displayName: string }; lastMessagePreview: string; unreadCount: number }[] }>(
    '/api/messages/conversations',
  );

  return (
    <Card
      title="Messages"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/messages')}>
          Open
        </Button>
      }
    >
      {conversations.loading ? (
        <LoadingLine label="Loading messages…" />
      ) : conversations.error ? (
        <ErrorLine message={conversations.error} />
      ) : !conversations.data || conversations.data.conversations.length === 0 ? (
        <p className="small faint">No conversations yet.</p>
      ) : (
        <div className="list">
          {conversations.data.conversations.slice(0, 3).map((conversation) => (
            <ListRow
              key={conversation.threadId}
              title={conversation.counterpart.displayName}
              trailing={conversation.unreadCount > 0 ? <Chip accent>{conversation.unreadCount}</Chip> : null}
              onClick={() => navigate(`/messages/${conversation.threadId}`)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function FriendsWidget(): JSX.Element {
  const navigate = useNavigate();
  const friends = useQuery<{ friends: { userId: string; displayName: string; avatarUrl: string }[] }>(
    '/api/social/friends',
  );

  return (
    <Card
      title="Friends"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/friends')}>
          Open
        </Button>
      }
    >
      {friends.loading ? (
        <LoadingLine label="Loading friends…" />
      ) : friends.error ? (
        <ErrorLine message={friends.error} />
      ) : !friends.data || friends.data.friends.length === 0 ? (
        <p className="small faint">No friends added yet.</p>
      ) : (
        <div className="row">
          {friends.data.friends.slice(0, 6).map((friend) => (
            <Avatar key={friend.userId} name={friend.displayName} src={friend.avatarUrl || null} size={32} round />
          ))}
        </div>
      )}
    </Card>
  );
}

function DailySummaryWidget(): JSX.Element {
  const navigate = useNavigate();
  const today = dayKey(new Date());
  const summary = useQuery<{
    fronting: unknown[];
    moods: unknown[];
    journal: unknown[];
    completedTasks: unknown[];
  }>(`/api/stats/day/${today}`);

  return (
    <Card
      title="Today so far"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/daily-summary')}>
          Full day
        </Button>
      }
    >
      {summary.loading ? (
        <LoadingLine label="Loading today…" />
      ) : summary.error ? (
        <ErrorLine message={summary.error} />
      ) : summary.data ? (
        <div className="stat-grid">
          <Stat label="Fronts" value={summary.data.fronting.length} />
          <Stat label="Moods" value={summary.data.moods.length} />
          <Stat label="Entries" value={summary.data.journal.length} />
          <Stat label="Tasks done" value={summary.data.completedTasks.length} />
        </div>
      ) : null}
    </Card>
  );
}

function MusicWidget(): JSX.Element {
  const navigate = useNavigate();
  const tracks = useCollection('musicTracks', { limit: 4 });

  return (
    <Card
      title="Music"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/music')}>
          Open
        </Button>
      }
    >
      {tracks.loading ? (
        <LoadingLine label="Loading music…" />
      ) : tracks.error ? (
        <ErrorLine message={tracks.error} />
      ) : tracks.items.length === 0 ? (
        <p className="small faint">No tracks saved yet.</p>
      ) : (
        <div className="stack stack--tight">
          {tracks.items.map((track) => (
            <div key={track.id} className="small truncate">
              {String(track['title'])}
              <span className="faint"> · {String(track['artist'] ?? '')}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function HeadspaceWidget(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();
  const maps = useCollection('headspaceMaps');
  const objects = useCollection('headspaceObjects');

  const loading = maps.loading || objects.loading;
  const error = maps.error ?? objects.error;

  return (
    <Card
      title={term('{{Headspace}}')}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/headspace')}>
          Open
        </Button>
      }
    >
      {loading ? (
        <LoadingLine label={term('Loading {{headspace}}…')} />
      ) : error ? (
        <ErrorLine message={error} />
      ) : maps.items.length === 0 ? (
        <p className="small faint">{term('No {{headspace}} mapped yet.')}</p>
      ) : (
        <div className="stat-grid">
          <Stat label="Maps" value={maps.items.length} />
          <Stat label="Places" value={objects.items.length} />
        </div>
      )}
    </Card>
  );
}

function FrontingStatsWidget(): JSX.Element {
  const navigate = useNavigate();
  const { term } = useI18n();
  const stats = useQuery<{ totals: { totalMinutes: number; eventCount: number } }>(
    '/api/fronting/stats',
    { days: 7 },
  );

  return (
    <Card
      title={term('{{Fronting}} this week')}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/stats')}>
          Stats
        </Button>
      }
    >
      {stats.loading ? (
        <LoadingLine label={term('Loading {{fronting}}…')} />
      ) : stats.error ? (
        <ErrorLine message={stats.error} />
      ) : (
        <div className="stat-grid">
          <Stat label="Recorded" value={formatDuration(stats.data?.totals.totalMinutes ?? 0)} />
          <Stat label={term('{{Fronts}}')} value={stats.data?.totals.eventCount ?? 0} />
        </div>
      )}
    </Card>
  );
}

function LocationWidget(): JSX.Element {
  const navigate = useNavigate();
  const dates = useDateFormat();
  const locations = useCollection('locationEntries', { limit: 1 });
  const latest = locations.items[0];

  return (
    <Card
      title="Last place"
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/locations')}>
          Open
        </Button>
      }
    >
      {locations.loading ? (
        <LoadingLine label="Loading location…" />
      ) : locations.error ? (
        <ErrorLine message={locations.error} />
      ) : !latest ? (
        <p className="small faint">Nothing recorded yet.</p>
      ) : (
        <div>
          <div className="small" style={{ fontWeight: 'var(--weight-medium)' }}>
            {String(latest['name'])}
          </div>
          <div className="tiny faint">{dates.relative(String(latest['visitedAt']))}</div>
        </div>
      )}
    </Card>
  );
}

function WidgetEditor({
  widgets,
  systemMode,
  onChange,
}: {
  widgets: WidgetSetting[];
  systemMode: boolean;
  onChange: (widgets: WidgetSetting[]) => void;
}): JSX.Element {
  const available = DASHBOARD_WIDGETS.filter(
    (widget) => systemMode || !('systemOnly' in widget && widget.systemOnly),
  );
  const ordered = [...widgets].sort((a, b) => a.order - b.order);

  const move = (id: string, direction: -1 | 1): void => {
    const index = ordered.findIndex((widget) => widget.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next.map((widget, position) => ({ ...widget, order: position })));
  };

  return (
    <div className="stack stack--tight">
      {ordered.map((widget) => {
        const definition = available.find((candidate) => candidate.id === widget.id);
        if (!definition) return null;
        return (
          <div key={widget.id} className="row row--nowrap row--between">
            <div className="row row--nowrap" style={{ flex: 1, minWidth: 0 }}>
              <button
                type="button"
                className="button button--ghost button--sm button--icon"
                onClick={() => move(widget.id, -1)}
                aria-label={`Move ${definition.label} up`}
              >
                <Icon name="chevronUp" size={13} />
              </button>
              <button
                type="button"
                className="button button--ghost button--sm button--icon"
                onClick={() => move(widget.id, 1)}
                aria-label={`Move ${definition.label} down`}
              >
                <Icon name="chevronDown" size={13} />
              </button>
              <span className="small truncate">{definition.label}</span>
            </div>
            <Switch
              label={`Show ${definition.label}`}
              checked={widget.visible}
              onChange={(visible) =>
                onChange(
                  widgets.map((candidate) =>
                    candidate.id === widget.id ? { ...candidate, visible } : candidate,
                  ),
                )
              }
            />
          </div>
        );
      })}
    </div>
  );
}

export { getEmotion, type StoredRecord };
