import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cachedSitemap } from '../../../functions/sitemap/cache';
import { parsePage, xmlResponse } from '../../../functions/sitemap/shared';
import { onRequest as categoriesShard } from '../../../functions/sitemaps/categories/[page].xml';
import { onRequest as profilesShard } from '../../../functions/sitemaps/profiles/[page].xml';
import { onRequest as templatesShard } from '../../../functions/sitemaps/templates/[page].xml';
import type { Env } from '../../../functions/api/types';

let revisions: Array<[string, string]>;
let publishedShards: Array<[string, number]>;
let statements: string[];
let cacheStore: Map<string, Response>;

// Drizzle maps field selects from `.raw()` rows. sitemap_revisions and the published
// shard lookup answer from the fixtures; every other query (the shard builds) is empty.
const env = {
  DB: {
    prepare: (query: string) => {
      statements.push(query);
      let params: unknown[] = [];
      const statement = {
        bind: (...values: unknown[]) => { params = values; return statement; },
        raw: async () => {
          if (query.includes('from "sitemap_revisions"')) return revisions;
          if (query.includes('from "sitemap_shard_revisions"')) {
            return publishedShards
              .filter(([kind, page]) => params[0] === kind && params[1] === page)
              .map(([, page]) => [page]);
          }
          return [];
        },
        all: async () => ({ results: [] }),
      };
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

type Shard = Parameters<typeof cachedSitemap>[2];

async function serve(
  build: ReturnType<typeof vi.fn>,
  url = 'https://serplists.com/sitemap.xml',
  method = 'GET',
  shard?: Shard,
) {
  const { ctx, settled } = context(url, method);
  const response = await cachedSitemap(ctx, build, shard);
  await settled();
  return response;
}

async function serveRoute(handler: PagesFunction<Env>, kind: string, page: string, method = 'GET') {
  const { ctx, settled } = context(`https://serplists.com/sitemaps/${kind}/${page}.xml`, method);
  const response = await handler({ ...ctx, params: { page } } as never);
  await settled();
  return response;
}

describe('cached sitemaps', () => {
  beforeEach(() => {
    revisions = [['profiles', '2030-01-01 00:00:00'], ['templates', '2030-01-01 00:00:00']];
    publishedShards = [['templates', 1]];
    statements = [];
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
    const pageOne = { kind: 'templates', page: '1' } as const;
    await serve(build, 'https://serplists.com/sitemaps/templates/1.xml?a=1', 'GET', pageOne);
    await serve(build, 'https://serplists.com/sitemaps/templates/1.xml?a=2', 'GET', pageOne);
    await serve(build, 'https://serplists.com/sitemaps/templates/001.xml', 'GET', { kind: 'templates', page: '001' });
    expect(build).toHaveBeenCalledOnce();
    publishedShards.push(['templates', 10]);
    await serve(build, 'https://serplists.com/sitemaps/templates/10.xml', 'GET', { kind: 'templates', page: '10' });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['templates', templatesShard],
    ['profiles', profilesShard],
    ['categories', categoriesShard],
  ] as const)('answers %s pages the index never published with one primary-key read', async (kind, handler) => {
    for (const page of ['2', '3', '50', '999', '49999']) {
      statements = [];
      const response = await serveRoute(handler, kind, page);

      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toContain('<urlset');
      expect(statements).toHaveLength(1);
      expect(statements[0]).toContain('from "sitemap_shard_revisions"');
    }
    expect(cacheStore.size).toBe(0);
  });

  it('rejects page numbers above the sitemap protocol limit before reading D1', async () => {
    const response = await serveRoute(templatesShard, 'templates', '9007199254740993');

    expect(response.status).toBe(404);
    expect(statements).toEqual([]);
    expect(parsePage('50000')).toBe(50_000);
    expect(parsePage('50001')).toBeNull();
    expect(parsePage('9007199254740991')).toBeNull();
  });

  it('answers HEAD for an unpublished page with the same 404 and no body', async () => {
    const response = await serveRoute(categoriesShard, 'categories', '7', 'HEAD');

    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
    expect(cacheStore.size).toBe(0);
  });

  it('builds page 1 without a lookup, even before the index has published any shard', async () => {
    publishedShards = [];
    const build = builder();
    const response = await serve(build, 'https://serplists.com/sitemaps/profiles/1.xml', 'GET', { kind: 'profiles', page: '1' });

    expect(response.status).toBe(200);
    expect(build).toHaveBeenCalledOnce();
    expect(statements.some((sql) => sql.includes('sitemap_shard_revisions'))).toBe(false);
  });

  it('builds a later page once the index has published it', async () => {
    const build = builder();
    const shard = { kind: 'templates', page: '2' } as const;
    expect((await serve(build, 'https://serplists.com/sitemaps/templates/2.xml', 'GET', shard)).status).toBe(404);
    expect(build).not.toHaveBeenCalled();

    publishedShards.push(['templates', 2]);
    expect((await serve(build, 'https://serplists.com/sitemaps/templates/2.xml', 'GET', shard)).status).toBe(200);
    expect(build).toHaveBeenCalledOnce();
  });

  it('rejects unsupported methods before reading D1', async () => {
    const build = builder();
    const response = await serve(build, 'https://serplists.com/sitemap.xml', 'POST');
    expect(response.status).toBe(405);
    expect(build).not.toHaveBeenCalled();
  });
});
