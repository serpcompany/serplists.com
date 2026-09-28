import { APIError } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const HOST = 'http://localhost:8788';
const SESSION_COOKIE = 'better-auth.session_token=SECRET_TOKEN.SIGNATURE';

function buildEnv() {
  return { BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
}

// Better Auth's getSession resolves null when there is no session and throws
// APIError('INTERNAL_SERVER_ERROR') when its database lookup fails.
async function loadRouter(getSession: () => Promise<unknown>) {
  vi.doMock('../../../../functions/api/better-auth', () => ({
    createBetterAuth: vi.fn(() => ({ api: { getSession: vi.fn(getSession) }, handler: vi.fn() })),
  }));
  const { default: apiWorker } = await import('../../../../functions/api/[[route]].ts');
  return (path: string, init?: RequestInit) =>
    apiWorker.fetch(
      new Request(`${HOST}/api/${path}`, { ...init, headers: { Cookie: SESSION_COOKIE, ...init?.headers } }),
      buildEnv(),
    );
}

// Each test imports the whole router graph fresh; allow for a busy machine.
describe('API router when the session lookup fails', { timeout: 30_000 }, () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    for (const method of ['info', 'warn', 'error'] as const) {
      vi.spyOn(console, method).mockImplementation((line: unknown) => {
        lines.push(String(line));
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('../../../../functions/api/better-auth');
    vi.resetModules();
  });

  it.each([
    ['GET', 'teams'],
    ['POST', 'checklists'],
    ['POST', 'uploads'],
    ['GET', 'agent-keys'],
  ])('answers %s /api/%s with 500, not 401, and logs the failure', async (method, path) => {
    const send = await loadRouter(async () => {
      throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to get session' });
    });

    const response = await send(path, {
      method,
      // Content-Length as a browser sends it: uploads without one get 411.
      ...(method === 'POST'
        ? { body: '{}', headers: { 'Content-Type': 'application/json', 'Content-Length': '2' } }
        : {}),
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal Server Error' });
    const events = lines.map((line) => JSON.parse(line).message);
    expect(events).toEqual(expect.arrayContaining(['session_lookup_failed', 'api_error']));
    expect(lines.join('\n')).not.toContain('SECRET_TOKEN');
  });

  it('still answers 401 when there is no session', async () => {
    const send = await loadRouter(async () => null);

    const response = await send('teams');

    expect(response.status).toBe(401);
    expect(lines.map((line) => JSON.parse(line).message)).not.toContain('session_lookup_failed');
  });
});
