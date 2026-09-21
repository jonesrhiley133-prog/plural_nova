import type { ApiError, ApiResult } from '@pluralnova/shared';

/**
 * The API client.
 *
 * Every call returns either data or a typed `ApiError` with a message written
 * for a person. Nothing in the app reads `response.ok` or catches a bare
 * exception, which is how "undefined" stops reaching the screen.
 */

const TOKEN_KEY = 'pluralnova.token';

export class ApiRequestError extends Error {
  readonly error: ApiError;
  readonly status: number;

  constructor(error: ApiError, status: number) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.error = error;
    this.status = status;
  }

  get code(): string {
    return this.error.code;
  }

  get retryable(): boolean {
    return this.error.retryable ?? false;
  }

  get fieldErrors(): Record<string, string> {
    return this.error.details ?? {};
  }
}

/** A failure that never reached the server: offline, DNS, a dropped connection. */
export class NetworkError extends ApiRequestError {
  constructor(message = 'Could not reach PluralNova. Your changes are saved on this device.') {
    super({ code: 'upstream_unavailable', message, retryable: true }, 0);
    this.name = 'NetworkError';
  }
}

let authToken: string | null = readStoredToken();
const listeners = new Set<(token: string | null) => void>();

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private mode or blocked storage: the session lives in memory for this tab.
    return null;
  }
}

export function getToken(): string | null {
  return authToken;
}

export function setToken(token: string | null): void {
  authToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage is unavailable; the in-memory token still works for this tab.
  }
  for (const listener of listeners) listener(token);
}

export function onTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Raw bodies (uploads) bypass JSON encoding. */
  raw?: { body: BodyInit; contentType: string; headers?: Record<string, string> };
  /** Returns the parsed body even when it is not the `{ ok, data }` envelope. */
  rawResponse?: boolean;
  timeoutMs?: number;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = path.startsWith('http') ? new URL(path) : new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.pathname + url.search;
}

const DEFAULT_TIMEOUT = 20_000;

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (authToken) headers['authorization'] = `Bearer ${authToken}`;

  let body: BodyInit | undefined;
  if (options.raw) {
    headers['content-type'] = options.raw.contentType;
    Object.assign(headers, options.raw.headers ?? {});
    body = options.raw.body;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
      signal: controller.signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    clearTimeout(timeout);
    if ((error as Error).name === 'AbortError') {
      throw new NetworkError('That took too long. Check your connection and try again.');
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (options.rawResponse) {
    if (!response.ok) throw toApiError(payload, response.status);
    return payload as T;
  }

  const envelope = payload as ApiResult<T> | null;
  if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
    if (envelope.ok) return envelope.data;
    throw new ApiRequestError(envelope.error, response.status);
  }

  if (!response.ok) throw toApiError(payload, response.status);
  return payload as T;
}

function toApiError(payload: unknown, status: number): ApiRequestError {
  const fallback: Record<number, string> = {
    401: 'Sign in to continue.',
    403: 'You do not have access to that.',
    404: 'That is not here any more.',
    413: 'That file is larger than the server accepts.',
    429: 'Too many attempts. Try again in a moment.',
    500: 'Something went wrong on our side. Nothing was changed.',
    502: 'PluralNova is not responding. This is on our side, not yours.',
    503: 'PluralNova is not responding. This is on our side, not yours.',
  };

  if (payload && typeof payload === 'object' && 'error' in payload) {
    return new ApiRequestError((payload as { error: ApiError }).error, status);
  }
  return new ApiRequestError(
    {
      code: status >= 500 ? 'server_error' : 'bad_request',
      message: fallback[status] ?? 'That did not work. Nothing was changed.',
      retryable: status >= 500 || status === 429,
    },
    status,
  );
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'GET', ...(query ? { query } : {}) }),
  post: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, query?: RequestOptions['query'], options: RequestOptions = {}) =>
    request<T>(path, { ...options, method: 'DELETE', ...(query ? { query } : {}) }),
};

/** Turns any thrown value into a message that is safe to put on screen. */
export function messageFor(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'That did not work. Nothing was changed.';
}

export function isOffline(error: unknown): boolean {
  return error instanceof NetworkError || !navigator.onLine;
}
