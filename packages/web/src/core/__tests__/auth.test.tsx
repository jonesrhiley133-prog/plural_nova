import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { defaultSettings } from '@pluralnova/shared';
import { AuthProvider, useAuth } from '../auth.js';
import { ApiRequestError, NetworkError, setToken } from '../api.js';

/**
 * An installed app that signs you out the moment you walk into a tunnel is a
 * bookmark with extra steps. The rule these tests pin down is the difference
 * between the two: only the server saying no ends a session — the server being
 * unreachable does not.
 */

const responses = { me: vi.fn() };

vi.mock('../api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api.js')>();
  return {
    ...actual,
    api: { ...actual.api, get: (path: string) => responses.me(path), post: async () => ({}) },
  };
});

function Probe(): JSX.Element {
  const { status, user } = useAuth();
  return <output data-status={status}>{user?.displayName ?? '—'}</output>;
}

const renderApp = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

const CACHED = {
  user: { id: 'usr_1', displayName: 'Test Constellation', activeSystemId: 'sys_1' },
  settings: defaultSettings('system'),
  systems: [{ id: 'sys_1', name: 'Test Constellation' }],
};

beforeEach(() => {
  localStorage.clear();
  responses.me.mockReset();
});

describe('session persistence', () => {
  it('opens signed out when there is no token', async () => {
    renderApp();
    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true })).toHaveAttribute('data-status', 'anonymous'),
    );
    expect(responses.me).not.toHaveBeenCalled();
  });

  it('stays signed in when the server cannot be reached', async () => {
    setToken('a-token');
    localStorage.setItem('pluralnova.session', JSON.stringify(CACHED));
    responses.me.mockRejectedValue(new NetworkError());

    renderApp();

    await waitFor(() => expect(responses.me).toHaveBeenCalled());
    const probe = screen.getByRole('status', { hidden: true });
    expect(probe).toHaveAttribute('data-status', 'authenticated');
    expect(probe).toHaveTextContent('Test Constellation');
  });

  it('signs out when the server rejects the token, and forgets the snapshot', async () => {
    setToken('a-stale-token');
    localStorage.setItem('pluralnova.session', JSON.stringify(CACHED));
    responses.me.mockRejectedValue(
      new ApiRequestError({ code: 'unauthorized', message: 'Signed out.' }, 401),
    );

    renderApp();

    await waitFor(() =>
      expect(screen.getByRole('status', { hidden: true })).toHaveAttribute('data-status', 'anonymous'),
    );
    expect(localStorage.getItem('pluralnova.session')).toBeNull();
  });

  it('records the confirmed session so the next launch has one to use', async () => {
    setToken('a-token');
    responses.me.mockResolvedValue({
      user: CACHED.user,
      settings: CACHED.settings,
      systems: CACHED.systems,
    });

    renderApp();

    await waitFor(() => expect(localStorage.getItem('pluralnova.session')).not.toBeNull());
    const stored = JSON.parse(localStorage.getItem('pluralnova.session') ?? '{}');
    expect(stored.user.displayName).toBe('Test Constellation');
    expect(stored.settings.mode).toBe('system');
  });

  it('shows the signed-in app immediately rather than flashing the sign-in screen', () => {
    setToken('a-token');
    localStorage.setItem('pluralnova.session', JSON.stringify(CACHED));
    // Never settles, standing in for a connection that is simply slow.
    responses.me.mockReturnValue(new Promise(() => undefined));

    renderApp();

    expect(screen.getByRole('status', { hidden: true })).toHaveAttribute(
      'data-status',
      'authenticated',
    );
  });
});
