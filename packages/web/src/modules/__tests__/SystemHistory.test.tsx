import { beforeEach, describe, expect, it, vi } from 'vitest';
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
let response: unknown = { items: [], total: 0, eventTypes: [], categories: [] };
const restoreHistoryEntry = vi.fn(async (_id: string) => undefined);

vi.mock('../../core/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/api.js')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      get: async (_path: string, query?: Record<string, string | number | undefined>) => {
        calls.push(query ?? {});
        return response;
      },
    },
  };
});

vi.mock('../../core/data.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/data.js')>()),
  useRecordMap: () => new Map(),
}));

vi.mock('../../core/auth.js', () => ({
  useAuth: () => ({ restoreHistoryEntry }),
}));

vi.mock('../../core/toast.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), fromError: vi.fn() }),
}));

vi.mock('../../core/i18n.js', () => ({
  useI18n: () => ({
    t: (key: string) => translate(key, { locale: 'en', terms }),
    term: (text: string) => translate(text, { locale: 'en', terms }),
  }),
  useDateFormat: () => ({ date: String, time: String, dateTime: String, relative: String }),
}));

describe('system history', () => {
  beforeEach(() => {
    response = { items: [], total: 0, eventTypes: [], categories: [] };
    restoreHistoryEntry.mockClear();
  });

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

  it('shows the before-and-after for a restorable change, and restores it on request', async () => {
    response = {
      items: [
        {
          id: 'hst_1',
          eventType: 'settings.theme',
          summary: 'Theme was changed',
          occurredAt: '2024-01-01T12:00:00.000Z',
          memberId: null,
          note: '',
          automatic: true,
          category: 'theme',
          entityType: 'settings',
          previousValue: JSON.stringify('dark'),
          newValue: JSON.stringify('light'),
          restorable: true,
        },
      ],
      total: 1,
      eventTypes: [{ key: 'settings.theme', count: 1 }],
      categories: [{ key: 'theme', count: 1 }],
    };
    const user = userEvent.setup();
    render(<SystemHistory />);

    expect(await screen.findByText('dark → light')).toBeInTheDocument();
    const restoreButton = screen.getByRole('button', { name: 'Restore' });
    await user.click(restoreButton);

    expect(restoreHistoryEntry).toHaveBeenCalledWith('hst_1');
  });

  it('diffs an object setting key by key instead of dumping both copies of it', async () => {
    response = {
      items: [
        {
          id: 'hst_3',
          eventType: 'settings.theme',
          summary: 'Theme was changed',
          occurredAt: '2024-01-01T12:00:00.000Z',
          memberId: null,
          note: '',
          automatic: true,
          category: 'theme',
          entityType: 'settings',
          previousValue: JSON.stringify({ base: 'dark', accent: '#7aa2f7', fontFamily: 'lexend' }),
          newValue: JSON.stringify({ base: 'dark', accent: '#7aa2f7', fontFamily: 'serif' }),
          restorable: true,
        },
      ],
      total: 1,
      eventTypes: [{ key: 'settings.theme', count: 1 }],
      categories: [{ key: 'theme', count: 1 }],
    };
    render(<SystemHistory />);

    expect(await screen.findByText('fontFamily: lexend → serif')).toBeInTheDocument();
    expect(screen.queryByText(/"base"/)).not.toBeInTheDocument();
  });

  it('does not offer to restore a change that already says it cannot be', async () => {
    response = {
      items: [
        {
          id: 'hst_2',
          eventType: 'member.updated',
          summary: 'Rowan’s profile was updated',
          occurredAt: '2024-01-01T12:00:00.000Z',
          memberId: null,
          note: '',
          automatic: true,
          category: 'system',
          entityType: 'member',
          previousValue: '',
          newValue: '',
          restorable: false,
        },
      ],
      total: 1,
      eventTypes: [{ key: 'member.updated', count: 1 }],
      categories: [{ key: 'system', count: 1 }],
    };
    render(<SystemHistory />);

    expect(await screen.findByText('Rowan’s profile was updated')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument();
  });
});
