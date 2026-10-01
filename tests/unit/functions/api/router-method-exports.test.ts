import { afterEach, describe, expect, it, vi } from 'vitest';

import { FRESH_ROUTER_IMPORT_TIMEOUT_MS, silenceRequestLog } from '../../../support/apiRouter';
import { serverContext } from '../../../support/nextServerContext';

vi.mock('@opennextjs/cloudflare', async () => (await import('../../../support/nextServerContext')).cloudflareMock);

const HOST = 'http://localhost:3000';
const FILE_KEY = 'template-images/user-1/photo.png';
const FILE_SIZE = 42;
const METHODS = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'] as const;

type RouteHandler = (request: Request) => Promise<Response>;
type RouteModule = Record<(typeof METHODS)[number], RouteHandler>;

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

function useEnv() {
  const env = {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    R2_UPLOADS: fakeR2Bucket(),
  };
  serverContext.env = env;
  return env;
}

async function loadRoute(): Promise<RouteModule> {
  return (await import('../../../../src/app/api/[[...route]]/route')) as unknown as RouteModule;
}

async function callTheHandlerExportedForItsMethod(request: Request): Promise<Response> {
  const route = await loadRoute();
  return route[request.method as (typeof METHODS)[number]](request);
}

describe('API route handler methods, which send every /api/* request to the API router instead of a page', { timeout: FRESH_ROUTER_IMPORT_TIMEOUT_MS }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('exports every method Next.js routes, all to the same handler', async () => {
    const route = await loadRoute();

    expect(Object.keys(route).sort()).toEqual([...METHODS]);
    for (const method of METHODS) expect(route[method]).toBe(route.GET);
  });

  it('answers HEAD /api/health from the API with no body', async () => {
    silenceRequestLog();
    useEnv();

    const response = await callTheHandlerExportedForItsMethod(new Request(`${HOST}/api/health`, { method: 'HEAD' }));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('X-Request-Id')).toBeTruthy();
    expect(await response.text()).toBe('');
  });

  it('answers HEAD for a missing upload with a JSON 404, not a page', async () => {
    silenceRequestLog();
    useEnv();

    const response = await callTheHandlerExportedForItsMethod(
      new Request(`${HOST}/api/uploads/file?key=${encodeURIComponent('template-images/user-1/missing.png')}`, {
        method: 'HEAD',
      }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(await response.text()).toBe('');
  });

  it("answers HEAD for an upload with the file's headers and without reading it", async () => {
    silenceRequestLog();
    const env = useEnv();

    const response = await callTheHandlerExportedForItsMethod(
      new Request(`${HOST}/api/uploads/file?key=${encodeURIComponent(FILE_KEY)}`, { method: 'HEAD' }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe(String(FILE_SIZE));
    expect(await response.text()).toBe('');
    expect(env.R2_UPLOADS.get).not.toHaveBeenCalled();
  });

  it('answers PATCH from the API instead of a page', async () => {
    silenceRequestLog();
    useEnv();

    const response = await callTheHandlerExportedForItsMethod(new Request(`${HOST}/api/nothing-here`, { method: 'PATCH' }));

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type') ?? '').not.toContain('text/html');
  });
});
