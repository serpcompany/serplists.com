import { afterEach, describe, expect, it, vi } from 'vitest';

import { authStatusWith } from '../../fixtures/authStatus';

const LOCAL_API = 'http://localhost:8787/api';

async function loadForALocalApi<T>(load: () => Promise<T>, where: 'in the page' | 'with no page'): Promise<T> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_API_URL', LOCAL_API);
  if (where === 'with no page') vi.stubGlobal('window', undefined);
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

describe('a build that names a local API, loaded in a page on this machine or with no page at all', () => {
  it("names the local API's MCP endpoint in the page, and the page origin's own otherwise", async () => {
    const inThePage = await loadForALocalApi(() => import('@/lib/api/request'), 'in the page');
    const withNoPage = await loadForALocalApi(() => import('@/lib/api/request'), 'with no page');

    expect(window.location.hostname).toBe('localhost');
    expect(inThePage.getAgentMcpEndpoint('https://serplists.com')).toBe(`${LOCAL_API}/mcp`);
    expect(withNoPage.getAgentMcpEndpoint('https://serplists.com')).toBe('https://serplists.com/api/mcp');
  });

  it('asks the local API for the sign-in options in the page, and its own /api otherwise', async () => {
    const inThePage = await loadForALocalApi(() => import('@/lib/auth-client'), 'in the page');
    const withNoPage = await loadForALocalApi(() => import('@/lib/auth-client'), 'with no page');
    const fetchStatus = vi.fn(async (_url: string, _init: RequestInit) => Response.json(authStatusWith()));
    vi.stubGlobal('fetch', fetchStatus);

    await expect(inThePage.getAuthStatus()).resolves.toEqual(authStatusWith());
    await expect(withNoPage.getAuthStatus()).resolves.toEqual(authStatusWith());

    expect(fetchStatus.mock.calls.map(([url]) => url)).toEqual([`${LOCAL_API}/auth/status`, '/api/auth/status']);
  });
});
