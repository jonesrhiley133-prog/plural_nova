import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * The browser APIs jsdom leaves out.
 *
 * These are stubs for capability, not behaviour — a test that depends on real
 * encryption gets Node's WebCrypto, not a fake — so a test passing here means
 * the same code path would work in a browser.
 */

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom has no layout, so these are no-ops rather than the exceptions jsdom throws.
window.scrollTo = () => undefined;
Element.prototype.scrollIntoView = () => undefined;

if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('style');
});

afterEach(cleanup);
