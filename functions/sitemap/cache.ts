import { and, eq } from 'drizzle-orm';
import { sitemapRevisions, sitemapShardRevisions } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';
import { defaultEdgeCache } from '../api/utils/edge-cache';
import bundledTemplateCatalog from './bundled-catalog.generated.json';
import {
  contentHash,
  methodNotAllowed,
  parsePage,
  renderUrlset,
  requestSupportsSitemap,
  xmlResponse,
} from './shared';

export type SitemapRevisionKind = (typeof sitemapRevisions.$inferSelect)['kind'];
export type SitemapRevisions = Map<SitemapRevisionKind, string>;

export async function loadSitemapRevisions(env: Env): Promise<SitemapRevisions> {
  const rows = await createDb(env)
    .select({ kind: sitemapRevisions.kind, revised_at: sitemapRevisions.revised_at })
    .from(sitemapRevisions);
  return new Map(rows.map((row) => [row.kind, row.revised_at]));
}

const bundledCatalogVersion = JSON.stringify(bundledTemplateCatalog);

export type SitemapContext = {
  request: Request;
  env: Env;
  waitUntil: (promise: Promise<unknown>) => void;
};

export type SitemapShard = {
  kind: 'categories' | 'profiles' | 'templates';
  page: string | string[] | undefined;
};

const REVISION_DEPENDENCIES = {
  index: ['categories', 'profiles', 'templates'],
  categories: ['categories'],
  profiles: ['profiles'],
  templates: ['templates'],
} as const satisfies Record<'index' | SitemapShard['kind'], readonly SitemapRevisionKind[]>;

async function publishedShardPage(env: Env, shard: SitemapShard): Promise<number | null> {
  const page = parsePage(shard.page);
  if (page === null) return null;
  if (page === 1) return page;
  const rows = await createDb(env)
    .select({ page: sitemapShardRevisions.page })
    .from(sitemapShardRevisions)
    .where(and(eq(sitemapShardRevisions.kind, shard.kind), eq(sitemapShardRevisions.page, page)))
    .limit(1);
  return rows.length > 0 ? page : null;
}

const asGetRequest = (request: Request): Request => new Request(request.url);

export async function cachedSitemap(
  context: SitemapContext,
  build: (request: Request, revisions: SitemapRevisions) => Promise<Response>,
  sitemap: 'index' | SitemapShard,
): Promise<Response> {
  const { request } = context;
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();
  let keyPath = '/sitemap.xml';
  if (sitemap !== 'index') {
    const page = await publishedShardPage(context.env, sitemap);
    if (page === null) return xmlResponse(request, renderUrlset([]), 404, 'no-store');
    keyPath = `/sitemaps/${sitemap.kind}/${page}.xml`;
  }
  const kinds = REVISION_DEPENDENCIES[sitemap === 'index' ? 'index' : sitemap.kind];
  const allRevisions = await loadSitemapRevisions(context.env);
  const revisions: SitemapRevisions = new Map(kinds.flatMap((kind) => {
    const revisedAt = allRevisions.get(kind);
    return revisedAt === undefined ? [] : [[kind, revisedAt] as const];
  }));
  const url = new URL(request.url);
  const version = await contentHash(JSON.stringify([
    kinds.map((kind) => [kind, revisions.get(kind) ?? null]),
    bundledCatalogVersion,
  ]));
  const key = new Request(`${url.origin}${keyPath}?v=${version}`);
  const cache = defaultEdgeCache();

  let response = await cache?.match(key);
  if (!response) {
    response = await build(asGetRequest(request), revisions);
    if (cache) context.waitUntil(cache.put(key, response.clone()));
  }
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
