import { useMemo, useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { Avatar, Button } from '../ui/primitives.js';
import { SearchField } from '../ui/forms.js';
import { Dialog, useDialog } from '../ui/overlays.js';
import { Icon } from '../ui/Icon.js';

/**
 * A compact "voting as" control: one button showing the current voter, which
 * opens a small searchable list. Keeps a large roster off the page itself.
 */
export function VoterPicker({
  members,
  value,
  onChange,
  systemLabel,
}: {
  members: StoredRecord[];
  value: string | null;
  onChange: (id: string | null) => void;
  systemLabel: string;
}): JSX.Element {
  const dialog = useDialog();
  const [query, setQuery] = useState('');
  const current = members.find((member) => member.id === value) ?? null;
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter(
      (member) => member['archived'] !== true && (!needle || String(member['name'] ?? '').toLowerCase().includes(needle)),
    );
  }, [members, query]);

  const pick = (id: string | null): void => {
    onChange(id);
    dialog.hide();
  };

  return (
    <>
      <Button variant="ghost" onClick={() => dialog.show()} aria-label="Choose who is voting">
        <span className="voter-trigger">
          <Avatar
            name={current ? String(current['name']) : systemLabel}
            src={current ? ((current['avatarUrl'] as string) || null) : null}
            color={current ? ((current['color'] as string) ?? null) : null}
            icon={current ? ((current['icon'] as string) ?? null) : 'system'}
            size={22}
            round
          />
          <span className="truncate">Voting as {current ? String(current['name']) : systemLabel}</span>
          <Icon name="chevronDown" size={14} />
        </span>
      </Button>
      <Dialog open={dialog.open} onClose={dialog.hide} title="Voting as">
        <div className="stack stack--tight">
          <SearchField value={query} onChange={setQuery} placeholder="Search" />
          <div className="chat-picker-list">
            <button type="button" className="chat-picker-row" aria-pressed={value === null} onClick={() => pick(null)}>
              <Avatar name={systemLabel} icon="system" size={32} round />
              <span className="chat-picker-row__body">
                <span className="chat-picker-row__name">{systemLabel}</span>
              </span>
              {value === null ? <Icon name="check" size={16} /> : null}
            </button>
            {shown.map((member) => (
              <button
                key={member.id}
                type="button"
                className="chat-picker-row"
                aria-pressed={value === member.id}
                onClick={() => pick(member.id)}
              >
                <Avatar
                  name={String(member['name'])}
                  src={(member['avatarUrl'] as string) || null}
                  color={(member['color'] as string) ?? null}
                  icon={(member['icon'] as string) ?? null}
                  size={32}
                  round
                />
                <span className="chat-picker-row__body">
                  <span className="chat-picker-row__name truncate">{String(member['name'])}</span>
                </span>
                {value === member.id ? <Icon name="check" size={16} /> : null}
              </button>
            ))}
          </div>
        </div>
      </Dialog>
    </>
  );
}
