import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings, requireCollection } from '@pluralnova/shared';
import { RecordForm } from '../RecordForm.js';

const SETTINGS = defaultSettings('singlet');

/**
 * The registry-derived form is the leverage point behind most of the app's
 * screens: fifty-odd modules get real create and edit behaviour because this
 * one component reads the collection definition. So these tests are about the
 * derivation, not about any one screen — a field added to a collection has to
 * appear, a rule declared on a field has to be enforced before anything is
 * sent, and defaults declared in the registry have to survive a submit.
 */

vi.mock('../../core/i18n.js', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    term: (text: string) => text.replace(/\{\{member\}\}/g, 'member'),
  }),
}));

vi.mock('../../core/auth.js', () => ({
  useSettings: () => SETTINGS,
  useSystemMode: () => false,
  useActiveMemberId: () => null,
}));

vi.mock('../../core/data.js', () => ({
  useCollection: () => ({ records: [], loading: false, error: null }),
}));

function renderForm(overrides: Partial<Parameters<typeof RecordForm>[0]> = {}) {
  const onSubmit = vi.fn(async (_values: Record<string, unknown>) => undefined);
  render(<RecordForm collection="fics" fields={['title', 'author', 'status']} onSubmit={onSubmit} {...overrides} />);
  return { onSubmit, user: userEvent.setup() };
}

describe('RecordForm', () => {
  it('renders a field for each name the registry declares', () => {
    renderForm();
    expect(screen.getByLabelText(/Title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Author/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reading status/)).toBeInTheDocument();
  });

  it('marks a required field as required in the accessibility tree', () => {
    renderForm();
    const title = requireCollection('fics').fields.find((field) => field.name === 'title');
    expect(title?.required).toBe(true);
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'false');
  });

  it('refuses to submit when a required field is empty, and says which one', async () => {
    const { onSubmit, user } = renderForm();
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('clears a field error as soon as the field is corrected', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'true');

    await user.type(screen.getByLabelText(/Title/), 'A long fic');
    expect(screen.getByLabelText(/Title/)).toHaveAttribute('aria-invalid', 'false');
  });

  it('submits the registry default for a field nobody touched', async () => {
    const { onSubmit, user } = renderForm();
    await user.type(screen.getByLabelText(/Title/), 'A long fic');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ title: 'A long fic', status: 'queued' });
  });

  it('applies the account default visibility to a new record', async () => {
    const { onSubmit, user } = renderForm();
    await user.type(screen.getByLabelText(/Title/), 'A long fic');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      visibility: SETTINGS.privacy.defaultVisibility,
    });
  });

  it('keeps the form on screen with its message when saving fails', async () => {
    const onSubmit = vi.fn(async (_values: Record<string, unknown>) => {
      throw new Error('The server said no.');
    });
    render(<RecordForm collection="fics" fields={['title']} onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/Title/), 'A long fic');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('The server said no.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Title/)).toHaveValue('A long fic');
  });
});
