import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl, Tabs } from '../primitives.js';

/**
 * `Tabs` and `SegmentedControl` replaced sixteen hand-rolled copies of the
 * same two markup shapes across the app's screens. The two are not
 * interchangeable — `Tabs` switches which panel of content is showing, so it
 * follows the WAI-ARIA tabs pattern exactly, including that only the selected
 * tab sits in the page's own Tab order; `SegmentedControl` sets a filter or a
 * mode, `role="group"` carries no such convention, and every option keeps its
 * own place in Tab order. These tests exist so a future edit that blurs that
 * distinction — say, by copying one component's keyboard handling onto the
 * other — fails immediately instead of quietly changing how either one is
 * reached by keyboard.
 */

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Bravo' },
  { value: 'c', label: 'Charlie' },
] as const;

describe('Tabs', () => {
  it('reports the clicked tab', () => {
    const onChange = vi.fn();
    render(<Tabs value="a" onChange={onChange} options={OPTIONS} label="Sections" />);

    fireEvent.click(screen.getByRole('tab', { name: 'Bravo' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('keeps only the selected tab in the page tab order', () => {
    render(<Tabs value="b" onChange={vi.fn()} options={OPTIONS} label="Sections" />);

    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tab', { name: 'Bravo' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Charlie' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves selection and focus with the arrow keys, wrapping at the ends', () => {
    const onChange = vi.fn();
    render(<Tabs value="a" onChange={onChange} options={OPTIONS} label="Sections" />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('c');

    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');

    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('c');

    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('marks the selected tab, and only that one, as selected', () => {
    render(<Tabs value="c" onChange={vi.fn()} options={OPTIONS} label="Sections" />);
    expect(screen.getByRole('tab', { name: 'Charlie' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('SegmentedControl', () => {
  it('reports the clicked option', () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="a" onChange={onChange} options={OPTIONS} label="Filter" />);

    fireEvent.click(screen.getByRole('button', { name: 'Charlie' }));
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('leaves every option in the page tab order, unlike Tabs', () => {
    render(<SegmentedControl value="b" onChange={vi.fn()} options={OPTIONS} label="Filter" />);

    for (const label of ['Alpha', 'Bravo', 'Charlie']) {
      expect(screen.getByRole('button', { name: label })).not.toHaveAttribute('tabindex');
    }
  });

  it('also moves the selection with the arrow keys', () => {
    const onChange = vi.fn();
    render(<SegmentedControl value="a" onChange={onChange} options={OPTIONS} label="Filter" />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Alpha' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('marks the pressed option with aria-pressed rather than aria-selected', () => {
    render(<SegmentedControl value="b" onChange={vi.fn()} options={OPTIONS} label="Filter" />);
    expect(screen.getByRole('button', { name: 'Bravo' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-pressed', 'false');
  });
});
