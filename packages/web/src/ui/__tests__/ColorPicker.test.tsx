import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ColorPicker, ColorSwatch } from '../ColorPicker.js';

/**
 * The one colour picker every colour field in the app renders — a member's
 * profile colour, a folder, the theme accent. Two of these tests exist
 * because the app was shipped once with them silently broken: dragging the
 * hue slider more than a step or two made it appear to stick, because the
 * picker re-derived its displayed hue by parsing the 8-bit hex it had just
 * written, and most one-degree nudges round-trip through hex to the exact
 * value they started from. Fixed by holding hue/saturation/value as its own
 * float state rather than re-deriving it from the lossy colour every render;
 * the fix stays fixed only if a small hue nudge keeps being checked exactly.
 */

beforeEach(() => {
  // Recent colours persist across mounts on purpose (that's the point of
  // them); across tests it just means one test's colour leaking into the
  // next one's assertions.
  try {
    localStorage.removeItem('pluralnova.recentColors');
  } catch {
    /* no localStorage in this environment; nothing to clear */
  }
});

describe('ColorPicker', () => {
  it('reports a hex colour typed directly', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorPicker value="#7aa2f7" onChange={onChange} />);

    const text = screen.getByLabelText('Colour, as hex');
    await user.clear(text);
    await user.type(text, '#22c55e');
    await user.tab();

    expect(onChange).toHaveBeenCalledWith('#22c55e');
  });

  it('accepts an rgb() string once switched to that format', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorPicker value="#7aa2f7" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'RGB' }));
    const text = screen.getByLabelText('Colour, as rgb');
    await user.clear(text);
    await user.type(text, 'rgb(34, 197, 94)');
    await user.tab();

    expect(onChange).toHaveBeenCalledWith('#22c55e');
  });

  it('accepts an hsl() string once switched to that format', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorPicker value="#000000" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'HSL' }));
    const text = screen.getByLabelText('Colour, as hsl');
    await user.clear(text);
    await user.type(text, 'hsl(240, 100%, 50%)');
    await user.tab();

    expect(onChange).toHaveBeenCalledWith('#0000ff');
  });

  it('ignores unparseable text rather than calling onChange with garbage', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ColorPicker value="#7aa2f7" onChange={onChange} />);

    const text = screen.getByLabelText('Colour, as hex');
    await user.clear(text);
    await user.type(text, 'not a colour');
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('is collapsed by default and expands on request', async () => {
    const user = userEvent.setup();
    render(<ColorPicker value="#7aa2f7" onChange={vi.fn()} />);

    expect(screen.queryByRole('slider', { name: /saturation/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /more colours/i }));
    expect(screen.getByRole('slider', { name: /saturation/i })).toBeInTheDocument();
  });

  it('starts open when told to', () => {
    render(<ColorPicker value="#7aa2f7" onChange={vi.fn()} defaultOpen />);
    expect(screen.getByLabelText('Hue')).toBeInTheDocument();
  });

  /*
   * The regression. A single ArrowRight on the hue slider must move it by
   * exactly one degree and keep it there — not silently round-trip through
   * hex and land back where it started, which is what a picker that derives
   * its displayed hue from the just-committed colour does the moment
   * saturation and value are not both at an extreme (where every hue maps to
   * a distinct, exactly-representable RGB triple).
   */
  /*
   * A real browser increments a focused range input's own value on an arrow
   * key before React ever sees it, so what the fix here has to guarantee is
   * that receiving a sequence of one-degree-apart values leaves the slider
   * showing each one exactly — jsdom does not implement that native "arrow
   * key nudges a range input" behaviour at all, so it is driven directly with
   * the `change` events a browser would have produced. The real key press is
   * covered against a genuine browser in e2e/color-picker.test.mjs.
   */
  it('moves the hue slider by exactly one degree per step, however many times', () => {
    const onChange = vi.fn();
    // s and v away from the corners: this is the case where nearby hues
    // collide in 8-bit RGB and the bug reproduced.
    render(<ColorPicker value="#5c7099" onChange={onChange} defaultOpen />);

    const hue = screen.getByLabelText('Hue') as HTMLInputElement;
    const start = Number(hue.value);

    for (let i = 1; i <= 20; i += 1) {
      fireEvent.change(hue, { target: { value: String(start + i) } });
      // The bug this guards against showed up only after the round trip
      // through the parent's state, which a bare fireEvent.change does not
      // exercise — so the read-back on each step matters, not just the last.
      expect(Number(hue.value)).toBe(start + i);
    }
  });

  it('keeps saturation and value exactly where a drag left them while hue moves', () => {
    const onChange = vi.fn();
    render(<ColorPicker value="#5c7099" onChange={onChange} defaultOpen />);

    const sv = screen.getByRole('slider', { name: /saturation/i });
    // A mid-square point, not a corner — corners are where every hue produces
    // the same white or black regardless, which would hide this exact bug.
    Object.defineProperty(sv.parentElement!, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200 }),
    });
    fireEvent.pointerDown(sv.parentElement!, { clientX: 60, clientY: 140, pointerId: 1 });

    const afterDrag = sv.getAttribute('aria-valuetext');

    // Now nudge hue by one degree via the slider, the way the reported bug
    // was found: the saturation/brightness readout must not have moved.
    const hue = screen.getByLabelText('Hue') as HTMLInputElement;
    fireEvent.change(hue, { target: { value: String(Number(hue.value) + 1) } });

    expect(sv.getAttribute('aria-valuetext')).toBe(afterDrag);
  });

  it('moves the saturation/value thumb with arrow keys', () => {
    render(<ColorPicker value="#5c7099" onChange={vi.fn()} defaultOpen />);
    const sv = screen.getByRole('slider', { name: /saturation/i });
    const before = sv.getAttribute('aria-valuetext');

    fireEvent.keyDown(sv, { key: 'ArrowUp' });

    expect(sv.getAttribute('aria-valuetext')).not.toBe(before);
  });

  it('offers presets and reports the preset colour on click', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ColorPicker
        value="#000000"
        onChange={onChange}
        presets={[{ id: 'test', label: 'Test blue', accent: '#3366ff' }]}
        defaultOpen
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Test blue' }));
    expect(onChange).toHaveBeenCalledWith('#3366ff');
  });

  it('remembers a chosen colour as a recent one after the picker remounts', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ColorPicker value="#7aa2f7" onChange={vi.fn()} defaultOpen />);

    const text = screen.getByLabelText('Colour, as hex');
    await user.clear(text);
    await user.type(text, '#123456');
    await user.tab();
    unmount();

    render(<ColorPicker value="#7aa2f7" onChange={vi.fn()} defaultOpen />);
    expect(screen.getByRole('button', { name: '#123456' })).toBeInTheDocument();
  });

  it('shows whether the colour reads clearly against a given background', async () => {
    const user = userEvent.setup();
    render(<ColorPicker value="#ffffff" onChange={vi.fn()} showContrastAgainst="#f5f5f5" defaultOpen />);
    expect(screen.getByText(/hard to read/i)).toBeInTheDocument();

    const text = screen.getByLabelText('Colour, as hex');
    await user.clear(text);
    await user.type(text, '#111111');
    await user.tab();
    expect(screen.getByText(/reads clearly/i)).toBeInTheDocument();
  });

  it('says nothing about contrast when no background is given', () => {
    render(<ColorPicker value="#ffffff" onChange={vi.fn()} defaultOpen />);
    expect(screen.queryByText(/reads clearly|hard to read/i)).not.toBeInTheDocument();
  });
});

describe('ColorSwatch', () => {
  it('shows a check mark only when selected', () => {
    const { rerender, container } = render(<ColorSwatch color="#ff0000" label="Red" onClick={vi.fn()} />);
    expect(container.querySelector('.color-swatch__check')).not.toBeInTheDocument();

    rerender(<ColorSwatch color="#ff0000" label="Red" onClick={vi.fn()} selected />);
    expect(container.querySelector('.color-swatch__check')).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no pressed state at all when it is not a button with a click handler', () => {
    render(<ColorSwatch color="#ff0000" label="Red" />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
  });
});
