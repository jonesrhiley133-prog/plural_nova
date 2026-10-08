import { useMemo, useState } from 'react';
import { emotionIdsOf, type Emotion, type StoredRecord } from '@pluralnova/shared';
import { Heatmap } from '../../charts/index.js';
import { Card, IconButton } from '../../ui/primitives.js';

/**
 * The mood calendar.
 *
 * One cell per day of the month: colour is the day's average mood, the
 * emoji is whichever emotion came up most that day. It reads `feelingEntries`
 * only, the same source the Snapshot tab lists — a day logged purely through
 * the older, separate Mood or Emotions screens doesn't have a day cell here,
 * the same way it wouldn't appear in a Snapshot search either.
 */

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function MoodCalendar({
  feelings,
  findEmotion,
}: {
  feelings: StoredRecord[];
  findEmotion: (id: string) => Emotion | undefined;
}): JSX.Element {
  const [monthOffset, setMonthOffset] = useState(0);

  const { rowLabels, values, cellLabels, monthLabel } = useMemo(() => {
    const anchor = new Date();
    anchor.setDate(1);
    anchor.setMonth(anchor.getMonth() + monthOffset);
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday

    const byDay = new Map<number, StoredRecord[]>();
    for (const entry of feelings) {
      const recordedAt = String(entry['recordedAt'] ?? '');
      if (!recordedAt) continue;
      const date = new Date(recordedAt);
      if (date.getFullYear() !== year || date.getMonth() !== month) continue;
      const list = byDay.get(date.getDate()) ?? [];
      list.push(entry);
      byDay.set(date.getDate(), list);
    }

    const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
    const values: number[][] = Array.from({ length: weekCount }, () => Array(7).fill(0));
    const cellLabels: (string | null)[][] = Array.from({ length: weekCount }, () => Array(7).fill(null));
    const rowLabels: string[] = Array.from({ length: weekCount }, (_, week) => {
      const start = Math.max(1, week * 7 - firstWeekday + 1);
      const end = Math.min(daysInMonth, week * 7 - firstWeekday + 7);
      return start <= end ? `${start}–${end}` : '';
    });

    for (let day = 1; day <= daysInMonth; day += 1) {
      const cellIndex = firstWeekday + day - 1;
      const week = Math.floor(cellIndex / 7);
      const weekday = cellIndex % 7;
      const dayEntries = byDay.get(day) ?? [];
      if (dayEntries.length === 0) continue;

      const averageMood = dayEntries.reduce((sum, entry) => sum + Number(entry['mood'] ?? 50), 0) / dayEntries.length;
      // A real average of 0 is possible but vanishingly rare; clamping the
      // floor to 1 keeps "no check-in" the only thing that reads as 0.
      values[week]![weekday] = Math.max(1, Math.round(averageMood));

      const emotionCounts = new Map<string, number>();
      for (const entry of dayEntries) {
        for (const id of emotionIdsOf(entry)) emotionCounts.set(id, (emotionCounts.get(id) ?? 0) + 1);
      }
      let dominant: string | null = null;
      let best = 0;
      for (const [id, count] of emotionCounts) {
        if (count > best) {
          dominant = id;
          best = count;
        }
      }
      cellLabels[week]![weekday] = dominant ? findEmotion(dominant)?.emoji ?? null : null;
    }

    return {
      rowLabels,
      values,
      cellLabels,
      monthLabel: anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    };
  }, [feelings, monthOffset, findEmotion]);

  return (
    <Card>
      <Heatmap
        title={monthLabel}
        subtitle="Darker means a higher average mood that day; the emoji is the day's most logged emotion."
        rows={rowLabels}
        columns={WEEKDAY_LABELS}
        values={values}
        cellLabels={cellLabels}
        valueLabel="Average mood"
        format={(value) => (value === 0 ? 'No check-in' : `${value}/100`)}
        emptyMessage="Check in on a few days and this calendar fills in."
        action={
          <>
            <IconButton
              icon="chevronLeft"
              label="Previous month"
              variant="ghost"
              size="sm"
              onClick={() => setMonthOffset((value) => value - 1)}
            />
            <IconButton
              icon="chevronRight"
              label="Next month"
              variant="ghost"
              size="sm"
              disabled={monthOffset >= 0}
              onClick={() => setMonthOffset((value) => Math.min(0, value + 1))}
            />
          </>
        }
      />
    </Card>
  );
}
