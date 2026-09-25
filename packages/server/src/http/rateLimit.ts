import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors.js';

/**
 * A small in-process limiter for the endpoints worth protecting: sign-in,
 * registration, password reset and vault unlock. It is deliberately simple —
 * a fixed window per key, held in memory — because its job is to blunt guessing,
 * not to be a distributed quota system.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  /** Defaults to the caller's IP; sign-in also keys on the email being tried. */
  keyOf?: (req: Request) => string;
  message?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const { max, windowMs } = options;
  return (req: Request, _res: Response, next: NextFunction): void => {
    // req.path is relative to whichever router is currently handling the
    // request, so two routers that both happen to expose e.g. "/unlock" would
    // otherwise share one bucket; req.baseUrl keeps them independent.
    const key = `${req.baseUrl}${req.path}:${options.keyOf?.(req) ?? req.ip ?? 'unknown'}`;
    const nowMs = Date.now();
    const window = windows.get(key);

    if (!window || window.resetAt <= nowMs) {
      windows.set(key, { count: 1, resetAt: nowMs + windowMs });
      return next();
    }

    window.count += 1;
    if (window.count > max) {
      const seconds = Math.ceil((window.resetAt - nowMs) / 1000);
      return next(
        new AppError(
          'rate_limited',
          options.message ?? `Too many attempts. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
        ),
      );
    }
    next();
  };
}

/** Clears expired windows so the map does not grow without bound. */
export function pruneRateLimits(): void {
  const nowMs = Date.now();
  for (const [key, window] of windows) {
    if (window.resetAt <= nowMs) windows.delete(key);
  }
}

export function resetRateLimits(): void {
  windows.clear();
}
