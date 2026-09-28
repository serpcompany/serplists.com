import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cachedSitemap, xmlResponse } from '../../../functions/sitemap/shared';
import type { Env } from '../../../functions/api/types';

let revisions: Array<[string, string]>;
let cacheStore: Map<string, Response>;

// Drizzle maps field selects from `.raw()` rows; only sitemap_revisions is queried here.
const env = {
  DB: {
    prepare: () => {
      const statement = { bind: () => statement, raw: async () => revisions, all: async () => ({ results: [] }) };
      return statement;
    },
  },
} as unknown as Env;

function context(url: string, method = 'GET') {
  const pending: Promise<unknown>[] = [];
  return {
    ctx: { request: new Request(url, { method }), env, waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } },
    settled: () => Promise.all(pending),
  };
}

async function serve(build: ReturnType<typeof vi.fn>, url = 'https://serplists.com/sitemap.xml', method = 'GET') {
  const { ctx, settled } = context(url, method);
  const response = await cachedSitemap(ctx, build);
  await settled();
  return response;
}

describe('cached sitemaps', () => {
  beforeEach(() => {
    revisions = [['profiles', '2030-01-01 00:00:00'], ['templates', '2030-01-01 00:00:00']];
    cacheStore = new Map();
    vi.stubGlobal('caches', {
      default: {
        match: async (key: Request) => cacheStore.get(key.url)?.clone(),
        put: async (key: Request, response: Response) => { cacheStore.set(key.url, response); },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const builder = () => vi.fn(async (request: Request) => xmlResponse(request, '<urlset/>'));

  it('builds once and serves repeats from the cache until a sitemap revision changes', async () => {
    const build = builder();
    expect(await (await serve(build)).text()).toBe('<urlset/>');
    expect(await (await serve(build)).text()).toBe('<urlset/>');
    expect(build).toHaveBeenCalledOnce();

    revisions = [['profiles', '2030-01-01 00:00:00'], ['templates', '2031-01-01 00:00:00']];
    await serve(build);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('caches the GET body when the first request is HEAD', async () => {
    const build = builder();
    const head = await serve(build, 'https://serplists.com/sitemap.xml', 'HEAD');
    const get = await serve(build);

    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(build.mock.calls[0][0].method).toBe('GET');
    expect(await get.text()).toBe('<urlset/>');
    expect(build).toHaveBeenCalledOnce();
  });

  it('ignores query strings and page-number padding so crawlers cannot bypass the cache', async () => {
    const build = builder();
    await serve(build, 'https://serplists.com/sitemaps/templates/1.xml?a=1');
    await serve(build, 'https://serplists.com/sitemaps/templates/1.xml?a=2');
    await serve(build, 'https://serplists.com/sitemaps/templates/001.xml');
    expect(build).toHaveBeenCalledOnce();
    await serve(build, 'https://serplists.com/sitemaps/templates/10.xml');
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported methods before reading D1', async () => {
    const build = builder();
    const response = await serve(build, 'https://serplists.com/sitemap.xml', 'POST');
    expect(response.status).toBe(405);
    expect(build).not.toHaveBeenCalled();
  });
});
