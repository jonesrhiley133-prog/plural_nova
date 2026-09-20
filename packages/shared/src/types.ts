import type { Timestamp } from './time.js';

/**
 * Visibility is enforced server-side on every read. `private` is the default for
 * anything new: a record only becomes shareable because someone chose to share it.
 */
export const VISIBILITY_LEVELS = ['private', 'system', 'members', 'friends', 'public'] as const;
export type Visibility = (typeof VISIBILITY_LEVELS)[number];

export const VISIBILITY_RANK: Record<Visibility, number> = {
  private: 0,
  system: 1,
  members: 2,
  friends: 3,
  public: 4,
};

/** Columns every stored record carries. Sync, backup and soft-delete all depend on them. */
export interface RecordBase {
  id: string;
  userId: string;
  systemId: string | null;
  memberId: string | null;
  visibility: Visibility;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
  /** Monotonic per-record counter. Conflict resolution compares this before timestamps. */
  version: number;
}

export type StoredRecord = RecordBase & Record<string, unknown>;

export type AppMode = 'system' | 'singlet';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: Timestamp;
  mode: AppMode;
  activeSystemId: string | null;
  /** The member new records are attributed to, when Profile Select is in use. */
  activeMemberId: string | null;
  onboardedAt: Timestamp | null;
  isGuest: boolean;
}

export interface AuthResponse {
  token: string;
  expiresAt: Timestamp;
  user: PublicUser;
}

/** Wire envelope. Every endpoint answers with one of these two shapes. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiError {
  code: ApiErrorCode;
  /** Human-readable and safe to show directly — never `undefined`, never a stack. */
  message: string;
  /** Field-level problems, keyed by field name. */
  details?: Record<string, string>;
  /** What the client may offer the user next. */
  retryable?: boolean;
}

export const API_ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'validation_failed',
  'rate_limited',
  'vault_locked',
  'payload_too_large',
  'upstream_unavailable',
  'server_error',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

/** A change the client made offline, replayed against the server in order. */
export interface OutboxOperation {
  id: string;
  collection: string;
  recordId: string;
  op: 'upsert' | 'delete';
  payload: Record<string, unknown> | null;
  baseVersion: number;
  queuedAt: Timestamp;
  attempts: number;
  lastError?: string;
}

export interface SyncPullResponse {
  changes: Record<string, StoredRecord[]>;
  cursor: Timestamp;
  hasMore: boolean;
}

export interface SyncPushResult {
  applied: string[];
  conflicts: SyncConflict[];
  rejected: { operationId: string; error: ApiError }[];
}

export interface SyncConflict {
  operationId: string;
  collection: string;
  recordId: string;
  /** Server's copy, so the client can present both sides rather than guessing. */
  server: StoredRecord;
  resolution: 'server_wins' | 'client_wins' | 'needs_review';
}
