import { afterEach, describe, expect, it, vi } from 'vitest';

import { authStatusWith } from '../../fixtures/authStatus';

const LOCAL_API = 'http://localhost:8787/api';

async function loadForALocalApi<T>(load: () => Promise<T>, where: 'in a page' | 'in a server render'): Promise<T> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_API_URL', LOCAL_API);
  if (where === 'in a server render') vi.stubGlobal('window', undefined);
  try {
    return await load();
  } finally {
    vi.unstubAllGlobals();
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('a build that names a local API, loaded in a page on this machine', () => {
  it("names the local API's MCP endpoint", async () => {
    const request = await loadForALocalApi(() => import('@/lib/api/request'), 'in a page');

    expect(window.location.hostname).toBe('localhost');
    expect(request.getAgentMcpEndpoint('https://serplists.com')).toBe(`${LOCAL_API}/mcp`);
  });

  it('asks the local API for the sign-in options', async () => {
    const authClient = await loadForALocalApi(() => import('@/lib/auth-client'), 'in a page');
    const fetchStatus = vi.fn(async (_url: string, _init: RequestInit) => Response.json(authStatusWith()));
    vi.stubGlobal('fetch', fetchStatus);

    await expect(authClient.getAuthStatus()).resolves.toEqual(authStatusWith());

    expect(fetchStatus.mock.calls.map(([url]) => url)).toEqual([`${LOCAL_API}/auth/status`]);
  });
});

describe('the same build loaded with no window, as a server render loads it', () => {
  it("shows the server's own /api MCP endpoint, as the Run Keys page asks for it before it knows the page origin", async () => {
    const request = await loadForALocalApi(() => import('@/lib/api/request'), 'in a server render');

    expect(request.getAgentMcpEndpoint()).toBe('/api/mcp');
  });

  it('builds its auth client without reading the page that is not there', async () => {
    const authClient = await loadForALocalApi(() => import('@/lib/auth-client'), 'in a server render');

    expect(authClient.authClient).toBeDefined();
  });
});
