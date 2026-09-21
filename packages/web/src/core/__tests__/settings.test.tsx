import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings, type AppSettings } from '@pluralnova/shared';
import { useOptimisticSettings } from '../settings.js';

/**
 * A switch has to move when it is pressed. If it waits for the server, a slow
 * connection looks like a broken control and no connection looks like a setting
 * that will not save — which is how this reads to someone who only ever sees
 * the switch.
 */

let saved: AppSettings = defaultSettings('system');
const save = vi.fn((_patch: Partial<AppSettings>): Promise<AppSettings> => Promise.resolve(saved));

vi.mock('../auth.js', () => ({
  useAuth: () => ({ settings: saved, saveSettings: save }),
}));

const toasts: string[] = [];
vi.mock('../toast.js', () => ({
  useToast: () => ({
    success: () => undefined,
    fromError: (_cause: unknown, message?: string) => toasts.push(message ?? 'error'),
  }),
}));

function Switch(): JSX.Element {
  const { settings, update } = useOptimisticSettings();
  return (
    <button type="button" onClick={() => update({ syncEnabled: !settings.syncEnabled })}>
      {settings.syncEnabled ? 'on' : 'off'}
    </button>
  );
}

beforeEach(() => {
  saved = defaultSettings('system');
  save.mockReset();
  toasts.length = 0;
});

describe('a settings control', () => {
  it('moves before the server has answered', async () => {
    // Never settles: the control must not be waiting on this.
    save.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    render(<Switch />);

    expect(screen.getByRole('button')).toHaveTextContent('on');
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('off');
  });

  it('goes back, with an explanation, when the save is refused', async () => {
    save.mockRejectedValue(new Error('nope'));
    const user = userEvent.setup();
    render(<Switch />);

    await user.click(screen.getByRole('button'));
    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('on'));
    expect(toasts).toEqual(['That setting was not saved']);
  });

  it('lets two quick presses compose instead of the second undoing the first', async () => {
    save.mockImplementation(async (patch: Partial<AppSettings>) => {
      saved = { ...saved, ...patch };
      return saved;
    });
    const user = userEvent.setup();
    render(<Switch />);

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByRole('button'));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[0]?.[0]).toEqual({ syncEnabled: false });
    expect(save.mock.calls[1]?.[0]).toEqual({ syncEnabled: true });
  });
});
