// What src/server reads from Next.js and OpenNext, for tests of the server-rendered page
// metadata (src/server/pageMeta/*). A test in tests/unit/server/pageMeta mocks the three
// modules with this state:
//
//   vi.mock('server-only', () => ({}));
//   vi.mock('@opennextjs/cloudflare', async () => (await import('../../../support/nextServerContext')).cloudflareMock);
//   vi.mock('next/headers', async () => (await import('../../../support/nextServerContext')).headersMock);
//
// and sets `serverContext.env` (the Worker's bindings, with D1 from tests/support/sqlite-d1.ts)
// and the host the request was sent to.
export const serverContext = {
  env: {} as Record<string, unknown>,
  host: 'serplists.com',
  protocol: 'https',
  waitUntil: [] as Promise<unknown>[],
};

export const cloudflareMock = {
  getCloudflareContext: async () => ({
    env: serverContext.env,
    ctx: { waitUntil: (promise: Promise<unknown>) => serverContext.waitUntil.push(promise) },
    cf: undefined,
  }),
};

export const headersMock = {
  headers: async () => new Headers({ host: serverContext.host, 'x-forwarded-proto': serverContext.protocol }),
};

/**
 * A data center's Cache API (`caches.default`), as withEdgeCache uses it: install it with
 * vi.stubGlobal('caches', { default: edgeCache.cache }). `entries` maps each key URL to what
 * was stored, with its Cache-Control header.
 */
export function createEdgeCache() {
  const entries = new Map<string, Response>();
  const cache = {
    match: async (request: Request) => entries.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => {
      entries.set(request.url, response.clone());
    },
  };
  return { cache, entries };
}

// A D1 binding whose every query fails, as when D1 is unreachable.
export const failingD1 = {
  prepare: () => {
    throw new Error('D1 is unavailable');
  },
  batch: () => Promise.reject(new Error('D1 is unavailable')),
};

// The API router validates its secret on every request.
export const API_SECRET = 'page-meta-test-secret-at-least-32-characters';
