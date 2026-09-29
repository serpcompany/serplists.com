import { DrizzleQueryError } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'SECRETTOKEN123';
const MODULES = {
  betterAuth: '../../../../functions/api/better-auth',
  checklists: '../../../../functions/api/handlers/checklists',
  teams: '../../../../functions/api/handlers/teams',
} as const;

function buildEnv(overrides?: Record<string, unknown>) {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    ...overrides,
  } as any;
}

// Each test imports the whole router graph fresh; allow for a busy machine.
describe('API router log path redaction', { timeout: 30_000 }, () => {
  const lines: string[] = [];
  const handlers = {
    authHandler: vi.fn(async () => new Response(null, { status: 302, headers: { Location: '/reset-password' } })),
    handleChecklists: vi.fn(async () => Response.json({ ok: true })),
    handleTeams: vi.fn(async () => Response.json({ ok: true })),
  };

  async function send(path: string, init: RequestInit = {}, env = buildEnv()) {
    const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
    return apiWorker.fetch(new Request(`http://localhost/api/${path}`, init), env);
  }

  beforeEach(() => {
    lines.length = 0;
    for (const handler of Object.values(handlers)) handler.mockClear();
    vi.doMock(MODULES.betterAuth, () => ({ createBetterAuth: () => ({ handler: handlers.authHandler }) }));
    vi.doMock(MODULES.checklists, () => ({ handleChecklists: handlers.handleChecklists }));
    vi.doMock(MODULES.teams, () => ({ handleTeams: handlers.handleTeams }));
    for (const level of ['info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    }
  });

  afterEach(() => {
    for (const modulePath of Object.values(MODULES)) vi.doUnmock(modulePath);
    vi.restoreAllMocks();
    vi.resetModules();
  });

  function loggedPaths(): string[] {
    return lines.map((line) => JSON.parse(line).path).filter((path) => path !== undefined);
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
    const apiError = lines.map((line) => JSON.parse(line)).find((entry) => entry.message === 'api_error');
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
