import { APIError } from 'better-auth/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureLogLines, FRESH_ROUTER_IMPORT_TIMEOUT_MS, freshApiWorker } from '../../../support/apiRouter';

const HOST = 'http://localhost:8788';
const SESSION_COOKIE = 'better-auth.session_token=SECRET_TOKEN.SIGNATURE';

function buildEnv() {
  return { BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!' } as any;
}

async function loadRouterWithBetterAuthGetSession(getSession: () => Promise<unknown>) {
  vi.doMock('../../../../functions/api/better-auth', () => ({
    createBetterAuth: vi.fn(() => ({ api: { getSession: vi.fn(getSession) }, handler: vi.fn() })),
  }));
  const apiWorker = await freshApiWorker();
  return (path: string, init?: RequestInit) =>
    apiWorker.fetch(
      new Request(`${HOST}/api/${path}`, { ...init, headers: { Cookie: SESSION_COOKIE, ...init?.headers } }),
      buildEnv(),
    );
}

describe('API router when the session lookup fails, which Better Auth reports by throwing', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  let lines: string[];

  beforeEach(() => {
    lines = captureLogLines(['info', 'warn', 'error']);
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
    const send = await loadRouterWithBetterAuthGetSession(async () => {
      throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Failed to get session' });
    });
    const jsonBodyWithTheContentLengthABrowserSends = { body: '{}', headers: { 'Content-Type': 'application/json', 'Content-Length': '2' } };

    const response = await send(path, { method, ...(method === 'POST' ? jsonBodyWithTheContentLengthABrowserSends : {}) });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal Server Error' });
    const events = lines.map((line) => JSON.parse(line).message);
    expect(events).toEqual(expect.arrayContaining(['session_lookup_failed', 'api_error']));
    expect(lines.join('\n')).not.toContain('SECRET_TOKEN');
  });

  it('still answers 401 when there is no session, which Better Auth reports as null', async () => {
    const send = await loadRouterWithBetterAuthGetSession(async () => null);

    const response = await send('teams');

    expect(response.status).toBe(401);
    expect(lines.map((line) => JSON.parse(line).message)).not.toContain('session_lookup_failed');
  });
});
