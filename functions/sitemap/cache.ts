import { and, eq } from 'drizzle-orm';
import { sitemap_revisions, sitemap_shard_revisions } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';
import bundledTemplateCatalog from './bundled-catalog.generated.json';
import {
  contentHash,
  methodNotAllowed,
  parsePage,
  renderUrlset,
  requestSupportsSitemap,
  xmlResponse,
} from './shared';

export type SitemapRevisionKind = (typeof sitemap_revisions.$inferSelect)['kind'];
export type SitemapRevisions = Map<SitemapRevisionKind, string>;

export async function loadSitemapRevisions(env: Env): Promise<SitemapRevisions> {
  const rows = await createDb(env)
    .select({ kind: sitemap_revisions.kind, revised_at: sitemap_revisions.revised_at })
    .from(sitemap_revisions);
  return new Map(rows.map((row) => [row.kind, row.revised_at]));
}

const bundledCatalogVersion = JSON.stringify(bundledTemplateCatalog);

type SitemapContext = Pick<EventContext<Env, string, unknown>, 'request' | 'env' | 'waitUntil'>;

/** A database shard route and its raw `[page]` parameter. */
export type SitemapShard = {
  kind: 'categories' | 'profiles' | 'templates';
  page: string | string[] | undefined;
};

// The `sitemap_revisions` kinds each sitemap's output depends on. Only these go in its
// cache key, so a sign-up or an avatar change (which bump only 'profiles') does not
// rebuild the templates and categories shards. This relies on the triggers in migration
// 0023 bumping a kind whenever that family's inputs change:
// - templates: public Template rows (every Template trigger bumps all kinds), and their
//   owners' usernames and `sitemap_owner_revisions` (the owner-update and user-delete
//   triggers bump 'templates' when the user has public Templates and a valid username).
// - categories: public categorized Template rows, their owners'
//   `sitemap_owner_revisions`, and `sitemap_category_revisions` (the Template,
//   owner-update and user-delete triggers bump 'categories' whenever they change these).
// - profiles: users with a valid username and `sitemap_profile_revisions` (the user and
//   Template triggers bump 'profiles'; users.updated_at can lag, see
//   docs/design-docs/d1-cost.md).
// - index: it lists every family and records their shard hashes, so it depends on all.
// A trigger that changes a family's inputs without bumping its kind would serve a stale
// shard for up to the 1-day s-maxage. tests/unit/functions/sitemap-migrations.test.ts
// pins which kinds each trigger bumps.
const REVISION_DEPENDENCIES = {
  index: ['categories', 'profiles', 'templates'],
  categories: ['categories'],
  profiles: ['profiles'],
  templates: ['templates'],
} as const satisfies Record<'index' | SitemapShard['kind'], readonly SitemapRevisionKind[]>;

// Crawlers learn shard numbers only from the index, which records every page it lists in
// `sitemap_shard_revisions` before it responds. Any other page number would miss the cache
// (the key includes the page) and scan every public row just to return 404, so check the
// page against that table by primary key first. Page 1 is always built: it holds the
// landing entry, and a new database has no shard rows until the index is first built.
async function isPublishedShard(env: Env, shard: SitemapShard): Promise<boolean> {
  const page = parsePage(shard.page);
  if (page === null) return false;
  if (page === 1) return true;
  const rows = await createDb(env)
    .select({ page: sitemap_shard_revisions.page })
    .from(sitemap_shard_revisions)
    .where(and(eq(sitemap_shard_revisions.kind, shard.kind), eq(sitemap_shard_revisions.page, page)))
    .limit(1);
  return rows.length > 0;
}

// Building a database sitemap scans every public Template or User, and D1 bills every
// row scanned. Cache each response in the data center under a key that changes when the
// sitemap triggers bump one of the `sitemap_revisions` kinds it depends on, or a deploy
// changes the bundled catalog, so a repeat request reads only the revision rows
// (docs/design-docs/d1-cost.md). `build` receives only those kinds, so it cannot read one
// its key ignores. The key drops the query string and leading zeros in page numbers, so
// variants cannot bypass it, and shard routes pass their shard so pages the index never
// published are refused before any build. That refusal is not cached anywhere, so a page
// the index adds later is served.
export async function cachedSitemap(
  context: SitemapContext,
  build: (request: Request, revisions: SitemapRevisions) => Promise<Response>,
  sitemap: 'index' | SitemapShard,
): Promise<Response> {
  const { request } = context;
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();
  if (sitemap !== 'index' && !(await isPublishedShard(context.env, sitemap))) {
    return xmlResponse(request, renderUrlset([]), 404, 'no-store');
  }
  const kinds = REVISION_DEPENDENCIES[sitemap === 'index' ? 'index' : sitemap.kind];
  const allRevisions = await loadSitemapRevisions(context.env);
  const revisions: SitemapRevisions = new Map(kinds.flatMap((kind) => {
    const revisedAt = allRevisions.get(kind);
    return revisedAt === undefined ? [] : [[kind, revisedAt] as const];
  }));
  const url = new URL(request.url);
  // A missing row keys as null, so the key stays stable until the row appears.
  const version = await contentHash(JSON.stringify([
    kinds.map((kind) => [kind, revisions.get(kind) ?? null]),
    bundledCatalogVersion,
  ]));
  const path = url.pathname.replace(/\/0+(?=\d)/g, '/');
  const key = new Request(`${url.origin}${path}?v=${version}`);
  const cache = typeof caches === 'undefined' ? undefined : caches.default;

  let response = await cache?.match(key);
  if (!response) {
    // Always build the GET body so a HEAD request never caches an empty sitemap.
    response = await build(new Request(request.url), revisions);
    if (cache) context.waitUntil(cache.put(key, response.clone()));
  }
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
