import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';

/**
 * Test harness.
 *
 * Boots the real app against a throwaway SQLite file — no mocks, no in-memory
 * stand-ins for the database — so the tests exercise the same scoping,
 * validation and migration code that runs in production.
 */

export interface TestClient {
  app: Express;
  /** Clears the rate-limit windows so a suite can register many accounts. */
  resetLimits: () => void;
  request: (
    method: string,
    path: string,
    options?: { body?: unknown; token?: string | null; headers?: Record<string, string> },
  ) => Promise<{ status: number; body: any }>;
  close: () => void;
}

export async function createTestApp(): Promise<TestClient> {
  const dir = mkdtempSync(join(tmpdir(), 'pluralnova-test-'));
  process.env['PLURALNOVA_DATA_DIR'] = dir;
  process.env['PLURALNOVA_SERVE_WEB'] = 'false';
  process.env['NODE_ENV'] = 'test';

  // Imported after the environment is set so config picks up the temp directory.
  const { openDatabase, migrate, closeDatabase } = await import('../db/index.js');
  const { createApp } = await import('../app.js');
  const { resetRateLimits } = await import('../http/rateLimit.js');

  const db = openDatabase(join(dir, 'test.sqlite'));
  migrate(db);
  resetRateLimits();

  const app = createApp();
  const { createServer } = await import('node:http');
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const request: TestClient['request'] = async (method, path, options = {}) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    };
    if (options.token) headers['authorization'] = `Bearer ${options.token}`;

    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: response.status, body };
  };

  return {
    app,
    request,
    resetLimits: resetRateLimits,
    close: () => {
      server.close();
      closeDatabase();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function registerUser(
  client: TestClient,
  overrides: { email?: string; displayName?: string; mode?: 'system' | 'singlet' } = {},
): Promise<{ token: string; userId: string; systemId: string }> {
  const email = overrides.email ?? `test-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const result = await client.request('POST', '/api/auth/register', {
    body: {
      email,
      password: 'a-strong-password-1',
      displayName: overrides.displayName ?? 'Test account',
      mode: overrides.mode ?? 'system',
    },
  });
  if (result.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(result.body)}`);
  return {
    token: result.body.data.token,
    userId: result.body.data.user.id,
    systemId: result.body.data.user.activeSystemId,
  };
}
