import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContextualCard, useContextualCard, type ContextualCardSubject } from '../ContextualCard.js';

const SUBJECT: ContextualCardSubject = {
  id: 'mem_1',
  name: 'Harbor',
  pronouns: 'they/them',
  frontStatusLabel: 'Currently fronting',
  flags: [{ id: 'flag_1', name: 'Protector', color: '#4477aa', icon: '🛡' }],
};

function Harness({ onSelect }: { onSelect: () => void }): JSX.Element {
  const card = useContextualCard<ContextualCardSubject>();
  return (
    <div>
      <button type="button" onClick={(event) => card.openFrom(event, SUBJECT)}>
        Open
      </button>
      <ContextualCard
        position={card.position}
        subject={card.subject}
        actions={[{ key: 'message', label: 'Message', onSelect }]}
        onClose={card.close}
      />
    </div>
  );
}

describe('ContextualCard', () => {
  it('is closed until opened, then shows the subject', () => {
    render(<Harness onSelect={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog', { name: 'Harbor' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('they/them')).toBeInTheDocument();
    expect(screen.getByText('Currently fronting')).toBeInTheDocument();
  });

  it('runs the action and closes when one is chosen', () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    fireEvent.click(screen.getByRole('button', { name: 'Message' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    render(<Harness onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on an outside click, not one inside the card', () => {
    render(<Harness onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    fireEvent.pointerDown(screen.getByText('Harbor'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
