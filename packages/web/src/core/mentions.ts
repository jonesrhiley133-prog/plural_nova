import { api } from './api.js';

/**
 * `@` mention candidates — the server already filters this to this
 * account's own members/groups plus whichever friends (and their
 * mentionable members) opted in. The client never sees, and so never has
 * to hide, a candidate it shouldn't have.
 */

export interface MentionUserCandidate {
  userId: string;
  handle: string | null;
  displayName: string;
  avatarUrl: string;
}

export interface MentionMemberCandidate {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  avatarUrl: string | null;
  mine: boolean;
  ownerUserId: string;
}

export interface MentionGroupCandidate {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
}

export interface MentionCandidates {
  users: MentionUserCandidate[];
  members: MentionMemberCandidate[];
  groups: MentionGroupCandidate[];
}

export function searchMentions(query: string): Promise<MentionCandidates> {
  return api.get<MentionCandidates>('/api/social/mentions', { q: query });
}
