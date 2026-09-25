import type { StoredRecord } from '@pluralnova/shared';
import { Avatar } from '../ui/primitives.js';

/**
 * "Recently chatted alters" — a compact, horizontally-scrollable row beneath
 * the composer for quickly choosing who a message is from. Sorted by most
 * recently fronted, which is the closest real signal this app already tracks
 * to "recently active" without inventing a second one.
 */
interface SendAsStripProps {
  members: StoredRecord[];
  value: string | null;
  onChange: (memberId: string | null) => void;
  allowWholeSystem?: boolean;
}

export function SendAsStrip({ members, value, onChange, allowWholeSystem = true }: SendAsStripProps): JSX.Element | null {
  if (members.length < 2) return null;

  const sorted = [...members].sort((a, b) => {
    const aFronting = a['frontStatus'] === 'front' ? 1 : 0;
    const bFronting = b['frontStatus'] === 'front' ? 1 : 0;
    if (aFronting !== bFronting) return bFronting - aFronting;
    return String(b['lastFrontedAt'] ?? '').localeCompare(String(a['lastFrontedAt'] ?? ''));
  });

  return (
    <div className="chat-send-as" role="radiogroup" aria-label="Send as">
      {allowWholeSystem ? (
        <button
          type="button"
          className="chat-send-as__option"
          role="radio"
          aria-checked={value === null}
          aria-label="Send as the system"
          onClick={() => onChange(null)}
        >
          <Avatar name="?" size={34} round />
        </button>
      ) : null}
      {sorted.map((member) => (
        <button
          key={member.id}
          type="button"
          className="chat-send-as__option"
          role="radio"
          aria-checked={value === member.id}
          aria-label={`Send as ${String(member['name'])}`}
          onClick={() => onChange(member.id)}
        >
          <Avatar
            name={String(member['name'])}
            src={(member['avatarUrl'] as string) ?? null}
            color={(member['color'] as string) ?? null}
            icon={(member['icon'] as string) ?? null}
            size={34}
            round
            ring={value === member.id}
          />
        </button>
      ))}
    </div>
  );
}
