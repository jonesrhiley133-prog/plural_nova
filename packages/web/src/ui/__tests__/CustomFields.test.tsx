import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CustomFieldValueEntry, StoredRecord } from '@pluralnova/shared';
import { MemberCustomFieldsEditor, MemberCustomFieldsView } from '../CustomFields.js';

/**
 * Definitions are shared and values are per member, so these tests build both
 * separately — a `StoredRecord`-shaped definition plus the small array of
 * answers one member gave against it — the same split the real screens work
 * with, rather than through a member's profile.
 */

function definition(overrides: { id: string; label: string; type: string } & Record<string, unknown>): StoredRecord {
  return {
    userId: 'u1',
    systemId: 's1',
    memberId: null,
    visibility: 'system',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    deletedAt: null,
    version: 1,
    sortOrder: 0,
    ...overrides,
  } as StoredRecord;
}

describe('MemberCustomFieldsView', () => {
  it('shows a placeholder when no fields have been defined for the system', () => {
    render(<MemberCustomFieldsView definitions={[]} values={[]} />);
    expect(screen.getByText('No custom fields set up for this system yet.')).toBeInTheDocument();
  });

  it('hides a defined field this member never answered', () => {
    const definitions = [definition({ id: 'cfd_1', label: 'Favourite drink', type: 'text' })];
    render(<MemberCustomFieldsView definitions={definitions} values={[]} />);
    expect(screen.queryByText('Favourite drink')).not.toBeInTheDocument();
    expect(
      screen.getByText('Nothing filled in here. Every field is optional — a blank one is not a gap.'),
    ).toBeInTheDocument();
  });

  it('renders an ungrouped field inline and a named group as its own card, for the member who answered them', () => {
    const definitions = [
      definition({ id: 'cfd_1', label: 'Favourite drink', type: 'text' }),
      definition({ id: 'cfd_2', label: 'Height', type: 'number', unit: 'cm', group: 'Physical' }),
    ];
    const values: CustomFieldValueEntry[] = [
      { definitionId: 'cfd_1', value: 'Tea' },
      { definitionId: 'cfd_2', value: '170' },
    ];
    render(<MemberCustomFieldsView definitions={definitions} values={values} />);
    expect(screen.getByText('Favourite drink')).toBeInTheDocument();
    expect(screen.getByText('Tea')).toBeInTheDocument();
    expect(screen.getByText('Physical')).toBeInTheDocument();
    expect(screen.getByText('170 cm')).toBeInTheDocument();
  });

  it('renders a checkbox field as Yes or No rather than the raw stored string', () => {
    const definitions = [definition({ id: 'cfd_1', label: 'Verified', type: 'checkbox' })];
    const values: CustomFieldValueEntry[] = [{ definitionId: 'cfd_1', value: 'true' }];
    render(<MemberCustomFieldsView definitions={definitions} values={values} />);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('shares one definition’s choices across whichever member answered it', () => {
    const definitions = [
      definition({
        id: 'cfd_1',
        label: 'Species',
        type: 'choice',
        options: [
          { id: 'opt_human', label: 'Human' },
          { id: 'opt_fictive', label: 'Fictive' },
        ],
      }),
    ];
    render(
      <MemberCustomFieldsView definitions={definitions} values={[{ definitionId: 'cfd_1', value: 'opt_fictive' }]} />,
    );
    expect(screen.getByText('Fictive')).toBeInTheDocument();
  });
});

describe('MemberCustomFieldsEditor', () => {
  function renderEditor(definitions: StoredRecord[], values: CustomFieldValueEntry[] = []) {
    const onSave = vi.fn(async (_next: CustomFieldValueEntry[]) => undefined);
    const onCancel = vi.fn();
    render(<MemberCustomFieldsEditor definitions={definitions} values={values} onSave={onSave} onCancel={onCancel} />);
    return { onSave, onCancel, user: userEvent.setup() };
  }

  it('explains there is nothing to answer yet when the system has no fields', () => {
    renderEditor([]);
    expect(screen.getByText(/No custom fields have been set up for this system yet/)).toBeInTheDocument();
  });

  it('saves a typed value against the right definition', async () => {
    const definitions = [definition({ id: 'cfd_1', label: 'Star sign', type: 'text' })];
    const { onSave, user } = renderEditor(definitions);

    await user.type(screen.getByLabelText('Star sign'), 'Libra');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ definitionId: 'cfd_1', value: 'Libra' }]);
  });

  it('leaves a field out of what gets saved when it is left blank', async () => {
    const definitions = [definition({ id: 'cfd_1', label: 'Star sign', type: 'text' })];
    const { onSave, user } = renderEditor(definitions);

    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it('records a true value from a checkbox field', async () => {
    const definitions = [definition({ id: 'cfd_1', label: 'Verified', type: 'checkbox' })];
    const { onSave, user } = renderEditor(definitions);

    await user.click(screen.getByRole('switch', { name: 'Verified' }));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ definitionId: 'cfd_1', value: 'true' }]);
  });

  it('starts from an existing answer and saves a changed one', async () => {
    const definitions = [definition({ id: 'cfd_1', label: 'Star sign', type: 'text' })];
    const { onSave, user } = renderEditor(definitions, [{ definitionId: 'cfd_1', value: 'Libra' }]);

    const input = screen.getByLabelText('Star sign') as HTMLInputElement;
    expect(input.value).toBe('Libra');
    await user.clear(input);
    await user.type(input, 'Scorpio');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ definitionId: 'cfd_1', value: 'Scorpio' }]);
  });

  it('picks one of the shared choices for a choice field', async () => {
    const definitions = [
      definition({
        id: 'cfd_1',
        label: 'Species',
        type: 'choice',
        options: [
          { id: 'opt_human', label: 'Human' },
          { id: 'opt_fictive', label: 'Fictive' },
        ],
      }),
    ];
    const { onSave, user } = renderEditor(definitions);

    await user.click(screen.getByRole('button', { name: /Species/i }));
    await user.click(screen.getByRole('button', { name: 'Fictive' }));
    await user.click(screen.getByRole('button', { name: /^Save$/i }));

    expect(onSave).toHaveBeenCalledWith([{ definitionId: 'cfd_1', value: 'opt_fictive' }]);
  });
});
