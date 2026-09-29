import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cachedSitemap } from '../../../functions/sitemap/cache';
import { parsePage, xmlResponse } from '../../../functions/sitemap/shared';
import { onRequest as sitemapIndex } from '../../../functions/sitemap.xml';
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
        run: async () => ({ success: true, meta: {}, results: [] }),
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

type Sitemap = Parameters<typeof cachedSitemap>[2];

async function serve(
  build: ReturnType<typeof vi.fn>,
  url = 'https://serplists.com/sitemap.xml',
  method = 'GET',
  sitemap: Sitemap = 'index',
) {
  const { ctx, settled } = context(url, method);
  const response = await cachedSitemap(ctx, build, sitemap);
  await settled();
  return response;
}

const allKinds = ['categories', 'profiles', 'templates'] as const;
type RevisionKind = (typeof allKinds)[number];

// Each family, the route that serves it, and the revision kinds its output depends on.
const families: Array<{ name: string; handler: PagesFunction<Env>; path: string; deps: readonly RevisionKind[] }> = [
  { name: 'index', handler: sitemapIndex as PagesFunction<Env>, path: '/sitemap.xml', deps: allKinds },
  { name: 'categories', handler: categoriesShard, path: '/sitemaps/categories/1.xml', deps: ['categories'] },
  { name: 'profiles', handler: profilesShard, path: '/sitemaps/profiles/1.xml', deps: ['profiles'] },
  { name: 'templates', handler: templatesShard, path: '/sitemaps/templates/1.xml', deps: ['templates'] },
];

// Serves a family's real route and reports whether it rebuilt: every build reads
// `users` or `templates`, and a cache hit reads only the revision rows.
async function rebuilds(family: (typeof families)[number]): Promise<boolean> {
  statements = [];
  const { ctx, settled } = context(`https://serplists.com${family.path}`);
  await family.handler({ ...ctx, params: { page: '1' } } as never);
  await settled();
  return statements.some((sql) => /from "(users|templates)"/.test(sql));
}

function setRevision(kind: RevisionKind, revisedAt: string) {
  revisions = [...revisions.filter(([existing]) => existing !== kind), [kind, revisedAt]];
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

  // Pages Functions match routes ignoring case and allow one trailing slash, so every one
  // of these reaches the same route with the same parsed page.
  it('keys by the parsed sitemap and page, so case and trailing-slash variants share one entry', async () => {
    const build = builder();
    for (const [path, page] of [['1.xml', '1'], ['1.XML', '1'], ['1.xMl/', '1'], ['1.xml/', '1'], ['001.XML/', '001']]) {
      await serve(build, `https://serplists.com/sitemaps/templates/${path}`, 'GET', { kind: 'templates', page });
    }
    expect(build).toHaveBeenCalledOnce();

    publishedShards.push(['templates', 10]);
    await serve(build, 'https://serplists.com/sitemaps/templates/10.XML', 'GET', { kind: 'templates', page: '10' });
    await serve(build, 'https://serplists.com/sitemaps/templates/10.xml/', 'GET', { kind: 'templates', page: '10' });
    expect(build).toHaveBeenCalledTimes(2);

    const index = builder();
    for (const url of ['https://serplists.com/sitemap.xml', 'https://serplists.com/sitemap.xml/', 'https://serplists.com/SITEMAP.XML']) {
      await serve(index, url);
    }
    expect(index).toHaveBeenCalledOnce();
    expect(cacheStore.size).toBe(3);
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

  it.each(allKinds)('rebuilds only the sitemaps that list %s after a change to that kind alone', async (kind) => {
    revisions = allKinds.map((each) => [each, '2030-01-01 00:00:00.000']);
    for (const family of families) expect(await rebuilds(family), family.name).toBe(true);
    for (const family of families) expect(await rebuilds(family), family.name).toBe(false);

    setRevision(kind, '2030-01-02 00:00:00.000');
    const rebuilt: string[] = [];
    for (const family of families) if (await rebuilds(family)) rebuilt.push(family.name);

    expect(rebuilt).toEqual(families.filter((family) => family.deps.includes(kind)).map((family) => family.name));
  });

  it('keys a missing revision row as a stable value that a new row replaces', async () => {
    const categories = families.find((family) => family.name === 'categories')!;
    revisions = [['profiles', '2030-01-01 00:00:00.000'], ['templates', '2030-01-01 00:00:00.000']];
    expect(await rebuilds(categories)).toBe(true);
    expect(await rebuilds(categories)).toBe(false);

    setRevision('categories', '2030-01-01 00:00:00.000');
    expect(await rebuilds(categories)).toBe(true);
    expect(await rebuilds(categories)).toBe(false);
  });

  it('passes each build only the revisions its key depends on', async () => {
    revisions = allKinds.map((each) => [each, `2030-01-0${allKinds.indexOf(each) + 1} 00:00:00.000`]);
    const build = builder();
    await serve(build, 'https://serplists.com/sitemaps/templates/1.xml', 'GET', { kind: 'templates', page: '1' });
    expect([...build.mock.calls[0][1]]).toEqual([['templates', '2030-01-03 00:00:00.000']]);
  });

  it('rejects unsupported methods before reading D1', async () => {
    const build = builder();
    const response = await serve(build, 'https://serplists.com/sitemap.xml', 'POST');
    expect(response.status).toBe(405);
    expect(build).not.toHaveBeenCalled();
  });
});
