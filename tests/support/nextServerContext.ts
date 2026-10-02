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

export const requestScopeMock = {
  connection: async () => undefined,
};

export const headersMock = {
  headers: async () => new Headers({ host: serverContext.host, 'x-forwarded-proto': serverContext.protocol }),
};

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

export const unreachableD1 = {
  prepare: () => {
    throw new Error('D1 is unavailable');
  },
  batch: () => Promise.reject(new Error('D1 is unavailable')),
};

export const SECRET_THE_API_ROUTER_VALIDATES = 'page-meta-test-secret-at-least-32-characters';
