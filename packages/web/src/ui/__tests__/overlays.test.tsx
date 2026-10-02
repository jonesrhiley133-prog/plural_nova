import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Dialog } from '../overlays.js';

/**
 * A dialog opened from inside another — the photo picker over the post
 * composer, say — used to get this backwards: every open `Dialog` listens for
 * Escape on `document`, and with two listening at once the one registered
 * first (the outer dialog) always ran first and closed itself, taking the
 * inner one down with it before the inner dialog's own listener ever saw the
 * key. Escape should close only whichever dialog is actually on top.
 */

describe('Dialog', () => {
  it('closes on Escape when it is the only one open', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Outer">
        <p>Body</p>
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes only the topmost of two open dialogs, leaving the other one up', () => {
    // Opened the way the app actually does it — the photo picker's dialog
    // doesn't exist yet when the post composer's does; a later, separate
    // click is what brings it up. Starting both open in the same initial
    // render wouldn't exercise the real sequence a nested dialog is reached by.
    function Nested(): JSX.Element {
      const [outerOpen, setOuterOpen] = useState(true);
      const [innerOpen, setInnerOpen] = useState(false);
      if (!outerOpen) return <p>All closed</p>;
      return (
        <Dialog open={outerOpen} onClose={() => setOuterOpen(false)} title="Outer">
          <button type="button" onClick={() => setInnerOpen(true)}>
            Open inner
          </button>
          {innerOpen ? (
            <Dialog open={innerOpen} onClose={() => setInnerOpen(false)} title="Inner">
              <p>Inner body</p>
            </Dialog>
          ) : null}
        </Dialog>
      );
    }

    render(<Nested />);
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open inner' }));
    expect(screen.getByRole('dialog', { name: 'Inner' })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Outer' })).toBeInTheDocument();
    // The outer dialog still covers the page, so the scroll lock must hold.
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Outer' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe('');
  });

  it('never closes on Escape when dismissible is false', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Required step" dismissible={false}>
        <p>Body</p>
      </Dialog>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
