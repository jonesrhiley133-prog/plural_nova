import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { translate, resolveTerminology } from '@pluralnova/shared';
import SystemHistory from '../SystemHistory.js';

/**
 * A screen that computes a time window on each render will hand `useQuery` a
 * slightly different question every time, and the answer will change the state
 * that caused the render — a loop that hammers the server for as long as the
 * page is open and shows nothing unusual on screen. It is worth one test.
 */

const terms = resolveTerminology(null);
const calls: Record<string, string | number | undefined>[] = [];

vi.mock('../../core/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/api.js')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      get: async (_path: string, query?: Record<string, string | number | undefined>) => {
        calls.push(query ?? {});
        return { items: [], total: 0, eventTypes: [] };
      },
    },
  };
});

vi.mock('../../core/data.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/data.js')>()),
  useRecordMap: () => new Map(),
}));

vi.mock('../../core/i18n.js', () => ({
  useI18n: () => ({
    t: (key: string) => translate(key, { locale: 'en', terms }),
    term: (text: string) => translate(text, { locale: 'en', terms }),
  }),
  useDateFormat: () => ({ date: String, time: String, dateTime: String, relative: String }),
}));

describe('system history', () => {
  it('asks the server once, not once per render', async () => {
    calls.length = 0;
    render(<SystemHistory />);

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    // Long enough for a render loop to make itself obvious.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(calls).toHaveLength(1);
  });

  it('asks again only when the range actually changes', async () => {
    calls.length = 0;
    const user = userEvent.setup();
    render(<SystemHistory />);
    await waitFor(() => expect(calls).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: 'Last week' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]?.['from']).not.toBe(calls[1]?.['from']);

    // Choosing the range that is already selected changes nothing to fetch.
    await user.click(screen.getByRole('button', { name: 'Last week' }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(calls).toHaveLength(2);
  });

  it('starts the window at a day boundary rather than at the current instant', async () => {
    calls.length = 0;
    render(<SystemHistory />);
    await waitFor(() => expect(calls).toHaveLength(1));

    const from = new Date(String(calls[0]?.['from']));
    expect(from.getHours()).toBe(0);
    expect(from.getMinutes()).toBe(0);
    expect(from.getSeconds()).toBe(0);
    expect(from.getMilliseconds()).toBe(0);
  });
});
