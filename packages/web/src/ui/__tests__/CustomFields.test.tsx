import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomFieldDef } from '@pluralnova/shared';
import { CustomFieldsEditor, CustomFieldsView } from '../CustomFields.js';

/**
 * The editor and the view it feeds share no hooks of their own — they take
 * the array and a save callback as plain props — so these tests exercise
 * them directly rather than through a member's profile.
 */

describe('CustomFieldsView', () => {
  it('shows a placeholder when nothing has been added yet', () => {
    render(<CustomFieldsView fields={[]} />);
    expect(screen.getByText('No custom fields yet.')).toBeInTheDocument();
  });

  it('renders an ungrouped field inline and a named group as its own card', () => {
    const fields: CustomFieldDef[] = [
      { id: 'cf_1', label: 'Favourite drink', type: 'text', value: 'Tea' },
      { id: 'cf_2', label: 'Height', type: 'number', value: '170', unit: 'cm', group: 'Physical' },
    ];
    render(<CustomFieldsView fields={fields} />);
    expect(screen.getByText('Favourite drink')).toBeInTheDocument();
    expect(screen.getByText('Tea')).toBeInTheDocument();
    expect(screen.getByText('Physical')).toBeInTheDocument();
    expect(screen.getByText('170 cm')).toBeInTheDocument();
  });

  it('renders a checkbox field as Yes or No rather than the raw stored string', () => {
    const fields: CustomFieldDef[] = [{ id: 'cf_1', label: 'Verified', type: 'checkbox', value: 'true' }];
    render(<CustomFieldsView fields={fields} />);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });
});

describe('CustomFieldsEditor', () => {
  function renderEditor(value: CustomFieldDef[] = []) {
    const onSave = vi.fn(async (_next: CustomFieldDef[]) => undefined);
    const onCancel = vi.fn();
    render(<CustomFieldsEditor value={value} onSave={onSave} onCancel={onCancel} />);
    return { onSave, onCancel, user: userEvent.setup() };
  }

  it('adds a field, opened for editing, and saves it with the label typed in', async () => {
    const { onSave, user } = renderEditor();
    await user.click(screen.getByRole('button', { name: /Add field/i }));

    const labelInput = screen.getByLabelText('Label');
    await user.clear(labelInput);
    await user.type(labelInput, 'Star sign');

    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as CustomFieldDef[];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ label: 'Star sign', type: 'text' });
  });

  it('drops a field left with a blank label rather than saving a nameless row', async () => {
    const { onSave, user } = renderEditor();
    await user.click(screen.getByRole('button', { name: /Add field/i }));
    await user.clear(screen.getByLabelText('Label'));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it('removes a field from what gets saved', async () => {
    const existing: CustomFieldDef[] = [{ id: 'cf_1', label: 'Keep me', type: 'text', value: '' }];
    const { onSave, user } = renderEditor(existing);

    await user.click(screen.getByRole('button', { name: 'Remove field' }));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it('switches a field to checkbox and records a true value from the switch', async () => {
    const { onSave, user } = renderEditor();
    await user.click(screen.getByRole('button', { name: /Add field/i }));

    const labelInput = screen.getByLabelText('Label');
    await user.clear(labelInput);
    await user.type(labelInput, 'Verified');

    await user.selectOptions(screen.getByLabelText('Type'), 'Yes / no');
    await user.click(screen.getByRole('switch', { name: 'Verified' }));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    const saved = onSave.mock.calls[0]?.[0] as CustomFieldDef[];
    expect(saved[0]).toMatchObject({ label: 'Verified', type: 'checkbox', value: 'true' });
  });
});
