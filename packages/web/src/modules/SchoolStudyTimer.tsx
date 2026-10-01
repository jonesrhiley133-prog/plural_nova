import { useState } from 'react';
import { formatDuration, formatDurationPrecise } from '@pluralnova/shared';
import { useCollection } from '../core/data.js';
import { useLiveSession } from '../core/liveSession.js';
import { useToast } from '../core/toast.js';
import { Avatar, Button, Card } from '../ui/primitives.js';
import { SelectField } from '../ui/forms.js';

/**
 * A timed study session against a class — the same start/stop/elapsed
 * pattern Work and Sleep already use (`useLiveSession`), just pointed at
 * `studySessions` instead. Embedded on School Life's own overview rather
 * than given a route of its own, since starting one is meant to be a single
 * tap from wherever School Life already is.
 */
export function StudyTimerCard(): JSX.Element {
  const toast = useToast();
  const classes = useCollection('classes', { filter: (cls) => cls['archived'] !== true });
  const sessions = useCollection('studySessions');
  const session = useLiveSession(sessions, 'startedAt', 'endedAt');
  const [selectedClassId, setSelectedClassId] = useState('');

  const classById = new Map(classes.items.map((cls) => [cls.id, cls]));
  const activeClass = session.active ? classById.get(String(session.active['classId'])) : undefined;

  const recent = [...sessions.items]
    .filter((item) => item['endedAt'])
    .sort((a, b) => String(b['startedAt']).localeCompare(String(a['startedAt'])))
    .slice(0, 5);

  const start = async (): Promise<void> => {
    if (!selectedClassId) return;
    await session.start({ classId: selectedClassId });
  };

  const stop = async (): Promise<void> => {
    await session.stop();
    toast.success('Study session saved');
  };

  return (
    <Card title="Study timer" subtitle={session.active ? undefined : 'Pick a class and start the clock.'}>
      {session.active ? (
        <div className="stack">
          <div className="row row--between">
            <span className="row" style={{ gap: 8 }}>
              <Avatar
                name={activeClass ? String(activeClass['name']) : '?'}
                color={(activeClass?.['color'] as string) ?? null}
                size={28}
                round
              />
              <strong>{activeClass ? String(activeClass['name']) : 'Studying'}</strong>
            </span>
            <span className="numeric">{formatDurationPrecise(session.elapsedSeconds)}</span>
          </div>
          <Button variant="secondary" icon="pause" onClick={() => void stop()}>
            Stop
          </Button>
        </div>
      ) : classes.items.length === 0 ? (
        <p className="small faint">Add a class first to start a study session.</p>
      ) : (
        <div className="row row--nowrap" style={{ alignItems: 'flex-end' }}>
          <span style={{ flex: 1 }}>
            <SelectField
              label="Class"
              value={selectedClassId}
              onChange={setSelectedClassId}
              placeholder="Choose a class"
              options={classes.items.map((cls) => ({ value: cls.id, label: String(cls['name']) }))}
            />
          </span>
          <Button variant="primary" icon="play" disabled={!selectedClassId} onClick={() => void start()}>
            Start
          </Button>
        </div>
      )}

      {recent.length > 0 ? (
        <div className="stack stack--tight" style={{ marginTop: 'var(--space-4)' }}>
          <span className="tiny faint">Recent sessions</span>
          {recent.map((item) => {
            const cls = classById.get(String(item['classId']));
            return (
              <div key={item.id} className="row row--between">
                <span className="small truncate">{cls ? String(cls['name']) : 'Unknown class'}</span>
                <span className="tiny faint">{formatDuration(Number(item['durationSeconds'] ?? 0) / 60)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
