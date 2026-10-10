import { useMemo } from 'react';
import { useCollection } from '../core/data.js';
import { Avatar } from '../ui/primitives.js';
import { Icon } from '../ui/Icon.js';
import { type SystemChatPerson, type SystemChatThreadSummary } from '../core/systemChat.js';

/**
 * A thread's participant roster — used both standalone (the conversation
 * view's collapsible panel/dialog) and inline inside `SystemChatInfoDialog`,
 * which is why this has no header or close chrome of its own: each caller
 * already has a place for that (the dialog's own title, or the panel's).
 * Fronting members sort first, same predicate `SendAsStrip` already uses for
 * "who's active," so the two don't disagree about who counts as fronting.
 */
export function ChatMemberPanel({ thread }: { thread: SystemChatThreadSummary }): JSX.Element {
  const members = useCollection('members');
  const people = thread.participants.length > 0 ? thread.participants : thread.person ? [thread.person] : [];

  const frontingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const member of members.items) {
      if (member['frontStatus'] === 'front') ids.add(member.id);
    }
    return ids;
  }, [members.items]);

  const sorted = useMemo(() => {
    const lastFrontedAt = (id: string): string => String(members.items.find((m) => m.id === id)?.['lastFrontedAt'] ?? '');
    return [...people].sort((a, b) => {
      const aFront = frontingIds.has(a.id) ? 1 : 0;
      const bFront = frontingIds.has(b.id) ? 1 : 0;
      if (aFront !== bFront) return bFront - aFront;
      return lastFrontedAt(b.id).localeCompare(lastFrontedAt(a.id));
    });
  }, [people, frontingIds, members.items]);

  const fronting = sorted.filter((person) => frontingIds.has(person.id));
  const everyoneElse = sorted.filter((person) => !frontingIds.has(person.id));

  return (
    <div className="chat-info__people">
      {fronting.length > 0 ? (
        <>
          <p className="chat-info__section-title">Fronting now</p>
          {fronting.map((person) => (
            <MemberRow key={person.id} person={person} fronting />
          ))}
          <p className="chat-info__section-title">Everyone else</p>
        </>
      ) : null}
      {everyoneElse.map((person) => (
        <MemberRow key={person.id} person={person} fronting={false} />
      ))}
    </div>
  );
}

function MemberRow({ person, fronting }: { person: SystemChatPerson; fronting: boolean }): JSX.Element {
  return (
    <div className="chat-info__person">
      <Avatar name={person.name} src={person.avatarUrl ?? null} color={person.color} icon={person.icon} size={40} round />
      <span className="chat-info__person-name">
        {person.prefix ? <span className="chat-message__prefix">{person.prefix}</span> : null}
        {person.name}
      </span>
      {fronting ? <Icon name="front" size={14} label="Fronting now" className="chat-info__person-front" /> : null}
    </div>
  );
}
