import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { translate, resolveTerminology } from '@pluralnova/shared';
import Emotions from '../Emotions.js';

/**
 * "Emotions reset while you were entering one" is on the list of failures this
 * build exists to not repeat, and it is exactly the kind of bug that reads fine
 * in the source: each step looks correct on its own, and the loss only happens
 * on the way between them. So the test walks the sheet the way a person does.
 */

const terms = resolveTerminology(null);
const created: Record<string, unknown>[] = [];

vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()] as const,
}));

vi.mock('../../core/data.js', () => ({
  useCollection: () => ({
    items: [],
    loading: false,
    error: null,
    create: async (values: Record<string, unknown>) => {
      created.push(values);
    },
  }),
  useRecordMap: () => [],
}));

vi.mock('../../core/i18n.js', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      translate(key, { locale: 'en', terms, ...(params ? { params } : {}) }),
    term: (text: string) => translate(text, { locale: 'en', terms }),
  }),
  useDateFormat: () => ({
    date: String,
    time: String,
    dateTime: String,
    relative: String,
  }),
}));

vi.mock('../../core/toast.js', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), fromError: vi.fn() }),
}));

vi.mock('../../core/auth.js', () => ({
  useSystemMode: () => false,
  useActiveMemberId: () => null,
}));

/**
 * Anchored to the whole accessible name: each option now sits beside its own
 * favourite-star button, whose label ("Add Grieving to favourites") also
 * contains the emotion's name, so an unanchored match finds both.
 */
function emotionButton(sheet: HTMLElement, name: string) {
  return within(sheet).getByRole('button', { name: new RegExp(`^${name}$`) });
}

async function openSheetAndPick(user: ReturnType<typeof userEvent.setup>) {
  // The header and the empty state both offer it; either opens the same sheet.
  await user.click(screen.getAllByRole('button', { name: /log an emotion/i })[0]!);
  const sheet = screen.getByRole('dialog');
  await user.click(within(sheet).getByRole('button', { name: /^Sadness$/i }));
  await user.click(emotionButton(sheet, 'Grieving'));
  // Choosing at least one emotion is what unlocks moving on to the intensity step.
  await user.click(within(sheet).getByRole('button', { name: /next/i }));
  return sheet;
}

describe('logging an emotion', () => {
  it('keeps the chosen emotion when moving forward and back between steps', async () => {
    const user = userEvent.setup();
    render(<Emotions />);
    const sheet = await openSheetAndPick(user);

    expect(within(sheet).getByText(/Grieving/)).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: /next/i }));
    expect(within(sheet).getByText(/Grieving/)).toBeInTheDocument();

    // All the way back to where it was chosen — the selection is still there.
    await user.click(within(sheet).getByRole('button', { name: /back/i }));
    await user.click(within(sheet).getByRole('button', { name: /back/i }));
    // Back at the picker: the summary chip and the still-selected list chip.
    expect(within(sheet).getAllByText(/Grieving/)).toHaveLength(2);
    expect(emotionButton(sheet, 'Grieving')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  it('keeps a chosen intensity when stepping away and back', async () => {
    const user = userEvent.setup();
    render(<Emotions />);
    const sheet = await openSheetAndPick(user);

    await user.click(within(sheet).getByRole('button', { name: /overwhelming/i }));
    await user.click(within(sheet).getByRole('button', { name: /next/i }));
    await user.click(within(sheet).getByRole('button', { name: /back/i }));

    expect(within(sheet).getByRole('button', { name: /overwhelming/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps a typed note when stepping back to change the intensity', async () => {
    const user = userEvent.setup();
    render(<Emotions />);
    const sheet = await openSheetAndPick(user);

    await user.click(within(sheet).getByRole('button', { name: /next/i }));
    const note = within(sheet).getByLabelText(/^Note$/i);
    await user.type(note, 'after the phone call');
    expect(note).toHaveValue('after the phone call');

    await user.click(within(sheet).getByRole('button', { name: /back/i }));
    await user.click(within(sheet).getByRole('button', { name: /next/i }));
    expect(within(sheet).getByLabelText(/^Note$/i)).toHaveValue('after the phone call');
  });

  it('cannot move past the first step before an emotion is chosen', async () => {
    const user = userEvent.setup();
    render(<Emotions />);

    await user.click(screen.getAllByRole('button', { name: /log an emotion/i })[0]!);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('saves everything the draft collected, not only the emotion', async () => {
    created.length = 0;
    const user = userEvent.setup();
    render(<Emotions />);
    const sheet = await openSheetAndPick(user);

    await user.click(within(sheet).getByRole('button', { name: /overwhelming/i }));
    await user.click(within(sheet).getByRole('button', { name: /next/i }));
    await user.type(within(sheet).getByLabelText(/^Note$/i), 'after the phone call');
    await user.click(within(sheet).getByRole('button', { name: /save/i }));

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      emotionId: 'sadness.grieving',
      category: 'sadness',
      intensity: 5,
      note: 'after the phone call',
    });
    expect(String(created[0]?.['recordedAt'])).not.toBe('');
  });

  it('logs one entry per emotion when more than one is picked', async () => {
    created.length = 0;
    const user = userEvent.setup();
    render(<Emotions />);

    await user.click(screen.getAllByRole('button', { name: /log an emotion/i })[0]!);
    const sheet = screen.getByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: /^Sadness$/i }));
    await user.click(emotionButton(sheet, 'Grieving'));
    await user.click(emotionButton(sheet, 'Heartbroken'));
    await user.click(within(sheet).getByRole('button', { name: /next/i }));
    await user.click(within(sheet).getByRole('button', { name: /next/i }));
    await user.click(within(sheet).getByRole('button', { name: /save/i }));

    expect(created).toHaveLength(2);
    expect(created.map((entry) => entry['emotionId'])).toEqual(
      expect.arrayContaining(['sadness.grieving', 'sadness.heartbroken']),
    );
    // Both share the one intensity and note chosen for the whole batch.
    expect(created[0]?.['intensity']).toBe(created[1]?.['intensity']);
  });
});
