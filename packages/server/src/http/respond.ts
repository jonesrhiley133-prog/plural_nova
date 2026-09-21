import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError, sendError } from './errors.js';

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data });
}

/** Wraps an async handler so a rejected promise reaches the error middleware. */
export function handler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (error instanceof AppError) {
    sendError(res, error);
    return;
  }

  if (error instanceof SyntaxError && 'body' in error) {
    sendError(res, new AppError('bad_request', 'That request body was not valid JSON.'));
    return;
  }

  if ((error as { type?: string }).type === 'entity.too.large') {
    sendError(res, new AppError('payload_too_large', 'That upload is larger than the server accepts.'));
    return;
  }

  console.error('[pluralnova] unhandled error:', error);
  sendError(
    res,
    new AppError('server_error', 'Something went wrong on our side. Nothing was changed.'),
  );
}

export function notFoundMiddleware(req: Request, res: Response): void {
  sendError(res, new AppError('not_found', `No API route matches ${req.method} ${req.path}.`));
}
