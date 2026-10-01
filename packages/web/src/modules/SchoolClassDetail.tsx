import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { percentOf } from '@pluralnova/shared';
import { useCollection, useQuery, useRecord } from '../core/data.js';
import { useDateFormat } from '../core/i18n.js';
import { useToast } from '../core/toast.js';
import { SCHOOL_TREND_LABEL, type SchoolStats } from '../core/schoolStats.js';
import { PageHeader } from '../app/PageHeader.js';
import { Avatar, Button, Card, Chip, IconButton, Stat } from '../ui/primitives.js';
import { EmptyState, SkeletonList } from '../ui/feedback.js';
import { ConfirmDialog, useDialog } from '../ui/overlays.js';
import { LineChart, RankedBars } from '../charts/index.js';
import { ClassEditorDialog } from './SchoolClasses.js';
import { LogGradeDialog } from './SchoolAssignments.js';

/** One class: its current grade, category breakdown, trend over the term, and the work behind it. */
export default function SchoolClassDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const dates = useDateFormat();

  const cls = useRecord('classes', id);
  const classes = useCollection('classes', { enabled: false });
  const assignments = useCollection('assignments', { filter: (a) => a['classId'] === id });
  const grades = useCollection('grades', { filter: (g) => g['classId'] === id });
  const stats = useQuery<SchoolStats>('/api/stats/school');
  const classStat = stats.data?.byClass.find((row) => row.classId === id) ?? null;

  const editor = useDialog();
  const confirmDelete = useDialog();
  const logGrade = useDialog();

  const trendPoints = useMemo(() => {
    const linkedAssignmentIds = new Set(
      grades.items.map((g) => g['assignmentId']).filter((v): v is string => typeof v === 'string' && v.length > 0),
    );
    const fromAssignments = assignments.items
      .filter((a) => !linkedAssignmentIds.has(a.id))
      .map((a) => ({ at: String(a['dueAt']), percent: percentOf(a['gradeReceived'], a['maxPoints']) }));
    const fromGrades = grades.items.map((g) => ({
      at: String(g['gradedAt']),
      percent: percentOf(g['pointsEarned'], g['maxPoints']),
    }));
    return [...fromAssignments, ...fromGrades]
      .filter((item): item is { at: string; percent: number } => item.percent !== null)
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [assignments.items, grades.items]);

  if ((assignments.loading || grades.loading) && !cls) return <SkeletonList rows={4} />;

  if (!cls) {
    return (
      <EmptyState
        icon="school"
        title="Class not found"
        body="It may have been deleted."
        action={{ label: 'Back to classes', run: () => navigate('/school/classes') }}
      />
    );
  }

  return (
    <>
      <div className="stack stack--loose">
        <PageHeader
          title={String(cls['name'])}
          description={[cls['teacher'], cls['room'], cls['period']].filter(Boolean).join(' · ') || undefined}
          actions={
            <>
              <Button variant="ghost" icon="star" onClick={() => logGrade.show()}>
                Log a grade
              </Button>
              <IconButton icon="edit" label="Edit class" variant="ghost" onClick={() => editor.show()} />
              <IconButton icon="trash" label="Delete class" variant="ghost" onClick={() => confirmDelete.show()} />
            </>
          }
        >
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <Avatar
              name={String(cls['name'])}
              color={(cls['color'] as string) ?? null}
              icon={(cls['icon'] as string) ?? null}
              size={32}
              round
            />
            {cls['subject'] ? <Chip>{String(cls['subject'])}</Chip> : null}
            {cls['schoolYear'] ? <span className="tiny faint">{String(cls['schoolYear'])}</span> : null}
            {cls['term'] ? <span className="tiny faint">{String(cls['term'])}</span> : null}
          </div>
        </PageHeader>

        <div className="stat-grid">
          <Stat
            label="Current grade"
            value={classStat?.currentPercentage !== null && classStat?.currentPercentage !== undefined ? `${classStat.currentPercentage}%` : '—'}
            detail={classStat?.letter ?? 'No grades yet'}
          />
          <Stat label="Trend" value={SCHOOL_TREND_LABEL[classStat?.trend ?? 'unknown']} />
          <Stat label="Graded so far" value={classStat?.gradedCount ?? 0} />
          <Stat label="Credits" value={cls['credits'] ? String(cls['credits']) : '—'} />
        </div>

        {classStat && classStat.categories.some((category) => category.count > 0) ? (
          <Card title="By category">
            <RankedBars
              title="Category averages"
              valueLabel="Percent"
              format={(value) => `${Math.round(value)}%`}
              items={classStat.categories
                .filter((category) => category.average !== null)
                .map((category) => ({
                  id: category.id,
                  label: `${category.name} (${category.weight}%)`,
                  value: category.average!,
                }))}
              emptyMessage="No graded categories yet."
            />
          </Card>
        ) : null}

        <Card title="Grade trend">
          <LineChart
            title="Percentage over the term"
            valueLabel="Percent"
            min={0}
            max={100}
            format={(value) => `${Math.round(value)}%`}
            points={trendPoints.map((point, index) => ({
              label: dates.date(point.at),
              value: point.percent,
              detail: `Entry ${index + 1}`,
            }))}
            emptyMessage="Not enough graded work yet to show a trend."
          />
        </Card>

        <Card title="Assignments and grades" flush>
          <div className="list">
            {[...assignments.items]
              .sort((a, b) => String(b['dueAt']).localeCompare(String(a['dueAt'])))
              .map((assignment) => {
                const percent = percentOf(assignment['gradeReceived'], assignment['maxPoints']);
                return (
                  <div key={assignment.id} className="list-row">
                    <span className="list-row__body">
                      <span className="list-row__title">{String(assignment['name'])}</span>
                      <span className="list-row__meta">
                        <span>{dates.date(String(assignment['dueAt']))}</span>
                        <Chip>{String(assignment['status'])}</Chip>
                      </span>
                    </span>
                    {percent !== null ? (
                      <span className="list-row__trailing">
                        <strong>{Math.round(percent * 10) / 10}%</strong>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            {grades.items.map((grade) => {
              const percent = percentOf(grade['pointsEarned'], grade['maxPoints']);
              return (
                <div key={grade.id} className="list-row">
                  <span className="list-row__body">
                    <span className="list-row__title">{String(grade['label'])}</span>
                    <span className="list-row__meta">
                      <span>{dates.date(String(grade['gradedAt']))}</span>
                      <Chip accent>Logged grade</Chip>
                    </span>
                  </span>
                  {percent !== null ? (
                    <span className="list-row__trailing">
                      <strong>{Math.round(percent * 10) / 10}%</strong>
                    </span>
                  ) : null}
                </div>
              );
            })}
            {assignments.items.length === 0 && grades.items.length === 0 ? (
              <p className="small faint" style={{ padding: 'var(--space-4)' }}>
                Nothing tracked for this class yet.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <ClassEditorDialog
        open={editor.open}
        onClose={editor.hide}
        classItem={cls}
        onSaved={() => {
          toast.success('Saved');
          stats.reload();
          editor.hide();
        }}
      />

      <LogGradeDialog
        open={logGrade.open}
        onClose={logGrade.hide}
        initial={{ classId: cls.id }}
        onSaved={() => {
          toast.success('Grade logged');
          stats.reload();
          logGrade.hide();
        }}
      />

      <ConfirmDialog
        open={confirmDelete.open}
        onClose={confirmDelete.hide}
        title="Delete this class?"
        body="Its assignments and grades stay on record but lose their class."
        onConfirm={async () => {
          await classes.remove(cls.id);
          toast.success('Deleted');
          navigate('/school/classes');
        }}
      />
    </>
  );
}
