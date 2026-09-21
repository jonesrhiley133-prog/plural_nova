import type { Response } from 'express';
import type { ApiError, ApiErrorCode } from '@pluralnova/shared';

/**
 * Errors the client can act on.
 *
 * Every failure leaves here as `{ ok: false, error: { code, message } }` with a
 * message written for a person, because "undefined" on a blank screen is the
 * specific failure this app is meant not to have. Internal detail is logged, not
 * returned.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: Record<string, string> | undefined;
  readonly retryable: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { status?: number; details?: Record<string, string>; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.details = options.details;
    this.retryable = options.retryable ?? RETRYABLE.has(code);
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
      retryable: this.retryable,
    };
  }
}

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  vault_locked: 423,
  payload_too_large: 413,
  upstream_unavailable: 502,
  server_error: 500,
};

const RETRYABLE = new Set<ApiErrorCode>(['rate_limited', 'upstream_unavailable', 'server_error']);

export const badRequest = (message: string, details?: Record<string, string>): AppError =>
  new AppError('bad_request', message, details ? { details } : {});

export const unauthorized = (message = 'Sign in to continue.'): AppError =>
  new AppError('unauthorized', message);

export const forbidden = (message = 'You do not have access to that.'): AppError =>
  new AppError('forbidden', message);

export const notFound = (what = 'That'): AppError =>
  new AppError('not_found', `${what} could not be found. It may have been deleted.`);

export const conflict = (message: string): AppError => new AppError('conflict', message);

export const validationFailed = (details: Record<string, string>): AppError =>
  new AppError('validation_failed', 'Some fields need attention.', { details });

export const vaultLocked = (): AppError =>
  new AppError('vault_locked', 'The vault is locked. Unlock it to see what is inside.');

export function sendError(res: Response, error: AppError): void {
  res.status(error.status).json({ ok: false, error: error.toApiError() });
}
