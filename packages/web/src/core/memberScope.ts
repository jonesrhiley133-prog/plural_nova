import { useState } from 'react';
import type { StoredRecord } from '@pluralnova/shared';
import { useCollection } from './data.js';
import { useSystemMode } from './auth.js';

/**
 * "The whole system, or one alter" — the filter every School Life screen
 * needs, extracted once rather than each page hand-rolling its own version
 * the way `Fronting.tsx` and `Journal.tsx` independently did before this.
 * Binary on purpose, like `Fronting.tsx`'s own filter: `null` means everyone,
 * a member id means just them. Degrades to nothing in Singlet Mode or with
 * fewer than two members, the same as the chip row it replaces did.
 */
export interface MemberScope {
  memberId: string | null;
  setMemberId: (id: string | null) => void;
  isWholeSystem: boolean;
  members: StoredRecord[];
  /** Spread into a `useQuery` call's params to scope a stats request. */
  queryParam: { memberId?: string };
}

export function useMemberScope(): MemberScope {
  const systemMode = useSystemMode();
  const members = useCollection('members', {
    enabled: systemMode,
    filter: (member) => member['archived'] !== true,
  });
  const [memberId, setMemberId] = useState<string | null>(null);

  return {
    memberId,
    setMemberId,
    isWholeSystem: memberId === null,
    members: systemMode ? members.items : [],
    queryParam: memberId ? { memberId } : {},
  };
}
