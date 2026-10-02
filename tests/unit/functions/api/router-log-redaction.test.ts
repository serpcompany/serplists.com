import { DrizzleQueryError } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLogLines, FRESH_ROUTER_IMPORT_TIMEOUT_MS, freshApiWorker } from '../../../support/apiRouter';
import { apiEnv } from '../../../support/apiEnv';
import type { Env } from '@functions/api/types';
import { jsonRecordIn } from '../../../support/storedJson';

const SECRET = 'SECRETTOKEN123';
const MODULES = {
  betterAuth: '../../../../functions/api/better-auth',
  checklists: '../../../../functions/api/handlers/checklists',
  teams: '../../../../functions/api/handlers/teams',
} as const;

function buildEnv(overrides: Partial<Env> = {}) {
  return apiEnv({
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    ...overrides,
  });
}

describe('API router log path redaction', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  let lines: string[];
  const handlers = {
    authHandler: vi.fn(async () => new Response(null, { status: 302, headers: { Location: '/reset-password' } })),
    handleChecklists: vi.fn(async () => Response.json({ ok: true })),
    handleTeams: vi.fn(async () => Response.json({ ok: true })),
  };

  async function send(path: string, init: RequestInit = {}, env = buildEnv()) {
    const apiWorker = await freshApiWorker();
    return apiWorker.fetch(new Request(`http://localhost/api/${path}`, init), env);
  }

  beforeEach(() => {
    for (const handler of Object.values(handlers)) handler.mockClear();
    vi.doMock(MODULES.betterAuth, () => ({ createBetterAuth: () => ({ handler: handlers.authHandler }) }));
    vi.doMock(MODULES.checklists, () => ({ handleChecklists: handlers.handleChecklists }));
    vi.doMock(MODULES.teams, () => ({ handleTeams: handlers.handleTeams }));
    lines = captureLogLines(['info', 'warn', 'error', 'debug']);
  });

  afterEach(() => {
    for (const modulePath of Object.values(MODULES)) vi.doUnmock(modulePath);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function loggedPaths(): string[] {
    return lines.map((line) => jsonRecordIn(line).path).filter((path) => path !== undefined).map(String);
  }

  it.each([
    ['a password-reset link', `auth/reset-password/${SECRET}?callbackURL=/reset-password`, 'auth/reset-password/:token'],
    ['a shared Run read', `checklists/shared/${SECRET}`, 'checklists/shared/:token'],
    ['an Organization invite accept', `teams/invites/${SECRET}/accept`, 'teams/invites/:token/accept'],
  ])('keeps the token of %s out of the request log', async (_label, path, expectedPath) => {
    const method = path.startsWith('teams') ? 'POST' : 'GET';
    const response = await send(path, { method });

    expect(response.status).toBeLessThan(400);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain(SECRET);
    expect(loggedPaths()).toEqual([expectedPath]);
  });

  it('keeps the token out of the api_error log when a handler throws', async () => {
    handlers.handleChecklists.mockRejectedValueOnce(new Error('boom'));

    const response = await send(`checklists/shared/${SECRET}`, { method: 'PUT', body: '{}' });

    expect(response.status).toBe(500);
    expect(lines.some((line) => line.includes('api_error'))).toBe(true);
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  it.each([
    ['a shared Run query', 'handleChecklists', `checklists/shared/${SECRET}`, 'PUT'],
    ['an invite member lookup', 'handleTeams', 'teams/team-1/invites', 'POST'],
  ] as const)('keeps the bound parameters of %s out of the api_error log', async (_label, handler, path, method) => {
    const email = 'alice@example.com';
    handlers[handler].mockRejectedValueOnce(
      new DrizzleQueryError(
        'select "id" from "checklist_runs" where "share_token" = ? and lower("email") = ?',
        [SECRET, email, 1],
        new Error('D1_ERROR: Network connection lost'),
      ),
    );

    const response = await send(path, { method, body: '{}' });

    expect(response.status).toBe(500);
    const logged = lines.join('\n');
    for (const value of [SECRET, email, 'params:']) expect(logged).not.toContain(value);
    const apiError = lines.map((line) => jsonRecordIn(line)).find((entry) => entry.message === 'api_error');
    expect(apiError).toMatchObject({
      errorName: 'DrizzleQueryError',
      errorMessage: 'D1_ERROR: Network connection lost',
    });
  });

  it('keeps the token out of the env_validation_error log', async () => {
    const response = await send(`checklists/shared/${SECRET}`, {}, buildEnv({ FRONTEND_URL: 'not a url' }));

    expect(response.status).toBe(500);
    expect(lines.some((line) => line.includes('env_validation_error'))).toBe(true);
    expect(lines.join('\n')).not.toContain(SECRET);
  });

  it('still logs id-bearing invite paths as they are', async () => {
    await send('teams/invites/pending/invite-123/accept', { method: 'POST' });

    expect(loggedPaths()).toEqual(['teams/invites/pending/invite-123/accept']);
  });
});
