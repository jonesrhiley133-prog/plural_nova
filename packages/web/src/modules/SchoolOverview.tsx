import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { dayKey, type StoredRecord } from '@pluralnova/shared';
import { useCollection, useQuery } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { SCHOOL_TREND_LABEL, type SchoolStats } from '../core/schoolStats.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, ListRow, Stat } from '../ui/primitives.js';
import { LoadingLine } from '../ui/feedback.js';
import { Icon } from '../ui/Icon.js';

const WEEKDAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function isDone(assignment: StoredRecord): boolean {
  const status = String(assignment['status'] ?? 'notStarted');
  return status === 'completed' || status === 'submitted';
}

const QUICK_ACTIONS = [
  { icon: 'task' as const, label: 'New assignment', path: '/school/assignments?new=1' },
  { icon: 'school' as const, label: 'Add a class', path: '/school/classes?new=1' },
  { icon: 'star' as const, label: 'Log a grade', path: '/school/assignments?logGrade=1' },
];

/** School Life's landing page — what's today, what's coming up, and how the term is going so far. */
export default function SchoolOverview(): JSX.Element {
  const navigate = useNavigate();
  const dates = useDateFormat();
  const now = useMemo(() => new Date(), []);
  const today = dayKey(now);
  const todayCode = WEEKDAY_CODES[now.getDay()];

  const classes = useCollection('classes', { filter: (cls) => cls['archived'] !== true });
  const assignments = useCollection('assignments');
  const stats = useQuery<SchoolStats>('/api/stats/school');
  const classById = new Map(classes.items.map((cls) => [cls.id, cls]));

  const todaysClasses = useMemo(
    () =>
      classes.items.filter(
        (cls) => Array.isArray(cls['meetingDays']) && (cls['meetingDays'] as string[]).includes(todayCode!),
      ),
    [classes.items, todayCode],
  );

  const dueToday = useMemo(
    () => assignments.items.filter((a) => !isDone(a) && dayKey(String(a['dueAt'])) === today),
    [assignments.items, today],
  );

  const upcoming = useMemo(() => {
    const weekOut = new Date(now);
    weekOut.setDate(weekOut.getDate() + 7);
    return assignments.items
      .filter((a) => !isDone(a) && new Date(String(a['dueAt'])) > now && new Date(String(a['dueAt'])) <= weekOut)
      .sort((a, b) => String(a['dueAt']).localeCompare(String(b['dueAt'])));
  }, [assignments.items, now]);

  const topAttention = stats.data?.needsAttention[0];

  return (
    <>
      <PageHeader
        title="School Life"
        description={now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        actions={
          <Button variant="primary" icon="plus" onClick={() => navigate('/school/assignments?new=1')}>
            New assignment
          </Button>
        }
      />

      <div className="split">
        <Card title="Today" subtitle={todaysClasses.length > 0 ? `${todaysClasses.length} classes meeting` : undefined}>
          {classes.loading || assignments.loading ? (
            <LoadingLine label="Loading today…" />
          ) : todaysClasses.length === 0 && dueToday.length === 0 ? (
            <p className="small faint">Nothing scheduled or due today.</p>
          ) : (
            <div className="stack stack--tight">
              {todaysClasses.map((cls) => (
                <div key={cls.id} className="row row--nowrap">
                  <Avatar
                    name={String(cls['name'])}
                    color={(cls['color'] as string) ?? null}
                    icon={(cls['icon'] as string) ?? null}
                    size={28}
                    round
                  />
                  <span className="small truncate" style={{ flex: 1 }}>
                    {String(cls['name'])}
                  </span>
                  {cls['startTime'] ? <span className="tiny faint">{String(cls['startTime'])}</span> : null}
                </div>
              ))}
              {dueToday.map((assignment) => {
                const cls = classById.get(String(assignment['classId']));
                return (
                  <div key={assignment.id} className="row row--nowrap">
                    <Icon name="task" size={16} />
                    <span className="small truncate" style={{ flex: 1 }}>
                      {String(assignment['name'])}
                    </span>
                    {cls ? <Chip color={cls['color'] as string}>{String(cls['name'])}</Chip> : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card
          title="Upcoming"
          subtitle="Next 7 days"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate('/school/assignments')}>
              All assignments
            </Button>
          }
        >
          {assignments.loading ? (
            <LoadingLine label="Loading upcoming…" />
          ) : upcoming.length === 0 ? (
            <p className="small faint">Nothing due in the next week.</p>
          ) : (
            <div className="stack stack--tight">
              {upcoming.slice(0, 6).map((assignment) => {
                const cls = classById.get(String(assignment['classId']));
                return (
                  <div key={assignment.id} className="row row--between">
                    <span className="small truncate">{String(assignment['name'])}</span>
                    <span className="row" style={{ gap: 6 }}>
                      {cls ? <Chip color={cls['color'] as string}>{String(cls['name'])}</Chip> : null}
                      <span className="tiny faint">{dates.date(String(assignment['dueAt']))}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Academic overview"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/school/analytics')}>
            Full analytics
          </Button>
        }
      >
        <div className="stat-grid">
          <Stat
            label="Average grade"
            value={
              stats.data?.averagePercentage !== null && stats.data?.averagePercentage !== undefined
                ? `${stats.data.averagePercentage}%`
                : '—'
            }
            detail={stats.data ? SCHOOL_TREND_LABEL[stats.data.trend] : undefined}
          />
          <Stat label="GPA" value={stats.data?.gpa ?? '—'} detail="Credit-weighted" />
        </div>
        {topAttention ? (
          <p className="small muted" style={{ marginTop: 'var(--space-3)' }}>
            <strong>{topAttention.name}</strong> is likely worth the most study time right now — {topAttention.currentPercentage}%
            {topAttention.percentagePointsBelowAverage > 0
              ? `, ${topAttention.percentagePointsBelowAverage} pts below your average`
              : ''}
            {topAttention.trend === 'falling' ? ' and trending down' : ''}.
          </p>
        ) : null}
      </Card>

      <Card title="Quick actions" flush>
        <div className="list">
          {QUICK_ACTIONS.map((action) => (
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
    </>
  );
}
