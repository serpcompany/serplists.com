import { afterEach, describe, expect, it, vi } from 'vitest';

const HOST = 'http://localhost:8788';
const FILE_KEY = 'template-images/user-1/photo.png';
const FILE_SIZE = 42;

const PAGES_VERB_EXPORTS: Record<string, string> = {
  GET: 'onRequestGet',
  HEAD: 'onRequestHead',
  POST: 'onRequestPost',
  PUT: 'onRequestPut',
  PATCH: 'onRequestPatch',
  DELETE: 'onRequestDelete',
  OPTIONS: 'onRequestOptions',
};

type PagesHandler = (context: { request: Request; env: unknown }) => Promise<Response>;
type RouterModule = Record<string, unknown> & { default: { fetch: (request: Request, env: unknown) => Promise<Response> } };

function fakeR2Bucket() {
  return {
    head: vi.fn(async (key: string) =>
      key === FILE_KEY
        ? {
            key: FILE_KEY,
            size: FILE_SIZE,
            etag: 'etag-1',
            httpEtag: '"etag-1"',
            writeHttpMetadata: (headers: Headers) => headers.set('Content-Type', 'image/png'),
          }
        : null,
    ),
    get: vi.fn(async () => null),
    put: vi.fn(),
    delete: vi.fn(),
  };
}

function buildEnv() {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    R2_UPLOADS: fakeR2Bucket(),
  } as any;
}

async function loadRouter(): Promise<RouterModule> {
  return (await import('../../../../functions/api/[[route]].ts')) as unknown as RouterModule;
}

// Mirrors the router wrangler builds for Pages (templates/pages-template-worker.ts):
// a verb export matches only its exact method, `onRequest` matches any method, and
// with neither the request falls through to static assets, whose SPA fallback
// answers 200 with index.html.
function pagesHandlerFor(router: RouterModule, method: string): PagesHandler | undefined {
  const verbExport = router[PAGES_VERB_EXPORTS[method]];
  const handler = typeof verbExport === 'function' ? verbExport : router.onRequest;
  return typeof handler === 'function' ? (handler as PagesHandler) : undefined;
}

async function pagesFetch(router: RouterModule, request: Request, env: unknown): Promise<Response> {
  const handler = pagesHandlerFor(router, request.method);
  if (!handler) {
    return new Response(request.method === 'HEAD' ? null : '<!doctype html>', {
      headers: { 'Content-Type': 'text/html' },
    });
  }
  return handler({ request, env });
}

// Each test imports the whole router graph fresh; allow for a busy machine.
describe('API router Pages exports', { timeout: 30_000 }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each(Object.keys(PAGES_VERB_EXPORTS))('routes %s requests to the API, not the SPA fallback', async (method) => {
    const router = await loadRouter();
    expect(pagesHandlerFor(router, method)).toBeTypeOf('function');
  });

  it('answers HEAD /api/health from the API with no body', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const router = await loadRouter();

    const response = await pagesFetch(router, new Request(`${HOST}/api/health`, { method: 'HEAD' }), buildEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
    expect(await response.text()).toBe('');
  });

  it('answers HEAD for a missing upload with a JSON 404, not the SPA page', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const router = await loadRouter();

    const response = await pagesFetch(
      router,
      new Request(`${HOST}/api/uploads/file?key=${encodeURIComponent('template-images/user-1/missing.png')}`, {
        method: 'HEAD',
      }),
      buildEnv(),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.text()).toBe('');
  });

  it("answers HEAD for an upload with the file's headers and without reading it", async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const router = await loadRouter();
    const env = buildEnv();

    const response = await pagesFetch(
      router,
      new Request(`${HOST}/api/uploads/file?key=${encodeURIComponent(FILE_KEY)}`, { method: 'HEAD' }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe(String(FILE_SIZE));
    expect(await response.text()).toBe('');
    expect(env.R2_UPLOADS.get).not.toHaveBeenCalled();
  });

  it('answers PATCH from the API instead of the SPA page', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const router = await loadRouter();

    const response = await pagesFetch(
      router,
      new Request(`${HOST}/api/nothing-here`, { method: 'PATCH' }),
      buildEnv(),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type') ?? '').not.toContain('text/html');
  });

  it('dispatches the default export the same way as the Pages export', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const router = await loadRouter();

    for (const method of ['HEAD', 'OPTIONS']) {
      const viaPages = await pagesFetch(router, new Request(`${HOST}/api/health`, { method }), buildEnv());
      const viaDefault = await router.default.fetch(new Request(`${HOST}/api/health`, { method }), buildEnv());
      expect(viaDefault.status).toBe(viaPages.status);
      expect(await viaDefault.text()).toBe(await viaPages.text());
    }
  });
});
