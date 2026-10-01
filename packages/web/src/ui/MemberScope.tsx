import type { MemberScope } from '../core/memberScope.js';
import { Chip } from './primitives.js';

/** The "Everyone / one alter" chip row for a `useMemberScope()`. Renders nothing with fewer than two members. */
export function MemberScopeChips({ scope, limit = 6 }: { scope: MemberScope; limit?: number }): JSX.Element | null {
  if (scope.members.length < 2) return null;

  return (
    <div className="row">
      <Chip selected={scope.isWholeSystem} onClick={() => scope.setMemberId(null)}>
        Everyone
      </Chip>
      {scope.members.slice(0, limit).map((member) => (
        <Chip
          key={member.id}
          selected={scope.memberId === member.id}
          onClick={() => scope.setMemberId(member.id)}
          color={(member['color'] as string) ?? null}
        >
          {String(member['name'])}
        </Chip>
      ))}
    </div>
  );
}
