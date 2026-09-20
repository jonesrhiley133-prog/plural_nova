import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerServiceWorker, useAppUpdate } from '../serviceWorker.js';
import { renderHook, act } from '@testing-library/react';

/**
 * The service worker's two reloads.
 *
 * One is wanted: the person pressed "Reload" on the update banner. The other is
 * not: a worker's first install calls `clients.claim()`, which fires the same
 * `controllerchange` event — and reloading on that bounces every first-time
 * visitor out of whatever they were part-way through.
 */

class FakeWorker extends EventTarget {
  state = 'installed';
  posted: unknown[] = [];
  postMessage(message: unknown) {
    this.posted.push(message);
  }
}

const listeners = new Map<string, ((event: Event) => void)[]>();
let waiting: FakeWorker | null;
let reloads: number;

function fire(type: string): void {
  for (const listener of listeners.get(type) ?? []) listener(new Event(type));
}

beforeEach(() => {
  listeners.clear();
  waiting = new FakeWorker();
  reloads = 0;

  const registration = {
    waiting,
    installing: null,
    addEventListener: () => undefined,
    navigationPreload: undefined,
  };

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {},
      register: () => Promise.resolve(registration),
      addEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.set(type, [...(listeners.get(type) ?? []), listener]);
      },
    },
  });

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, reload: () => { reloads += 1; } },
  });
});

describe('a controller change', () => {
  it('does not reload the page when no update was accepted', async () => {
    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();

    fire('controllerchange');
    expect(reloads).toBe(0);
  });

  it('reloads once the update banner is used', async () => {
    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const { result } = renderHook(() => useAppUpdate());
    expect(result.current.ready).toBe(true);

    act(() => result.current.apply());
    expect(waiting?.posted).toEqual([{ type: 'SKIP_WAITING' }]);

    fire('controllerchange');
    expect(reloads).toBe(1);

    // A second change — another tab, say — does not reload again.
    fire('controllerchange');
    expect(reloads).toBe(1);
  });
});
