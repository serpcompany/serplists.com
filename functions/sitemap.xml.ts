import type { Env } from './api/types';
import {
  buildInMemoryShardIndex,
  loadCategoryEntries,
  methodNotAllowed,
  PUBLIC_TEMPLATE_SQL_WHERE,
  renderSitemapIndex,
  requestSupportsSitemap,
  staticSitemapEntries,
  VALID_TEMPLATE_SLUG_SQL,
  VALID_USERNAME_SQL,
  type SitemapEntry,
  SITEMAP_PAGE_SIZE,
  xmlResponse,
} from './sitemap/shared';

type ShardSummary = {
  page: number;
  lastmod: string | null;
};

async function loadShardIndex(
  env: Env,
  kind: 'profiles' | 'templates',
  sql: string,
): Promise<SitemapEntry[]> {
  const result = await env.DB.prepare(sql)
    .bind(SITEMAP_PAGE_SIZE)
    .all<ShardSummary>();

  return result.results.map((row) => ({
    path: `/sitemaps/${kind}/${row.page}.xml`,
    lastmod: row.lastmod,
  }));
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();

  const profileShards = await loadShardIndex(
    env,
    'profiles',
    `SELECT shard AS page, MAX(lastmod) AS lastmod
       FROM (
         SELECT CAST((ROW_NUMBER() OVER (ORDER BY u.id) - 1) / ? AS INTEGER) + 1 AS shard,
                COALESCE(u.updated_at, u.created_at) AS lastmod
           FROM users AS u
          WHERE ${VALID_USERNAME_SQL}
       )
      GROUP BY shard
      ORDER BY shard`,
  );
  const templateShards = await loadShardIndex(
    env,
    'templates',
    `SELECT shard AS page, MAX(lastmod) AS lastmod
       FROM (
         SELECT CAST((ROW_NUMBER() OVER (ORDER BY t.id) - 1) / ? AS INTEGER) + 1 AS shard,
                COALESCE(t.updated_at, t.created_at) AS lastmod
           FROM templates AS t
           JOIN users AS u ON u.id = t.user_id
          WHERE ${PUBLIC_TEMPLATE_SQL_WHERE}
            AND ${VALID_TEMPLATE_SLUG_SQL}
            AND ${VALID_USERNAME_SQL}
       )
      GROUP BY shard
      ORDER BY shard`,
  );
  const categoryEntries = await loadCategoryEntries(env);
  const entries = [
    ...buildInMemoryShardIndex('static', staticSitemapEntries()),
    ...buildInMemoryShardIndex('categories', categoryEntries),
    ...profileShards,
    ...templateShards,
  ];

  return xmlResponse(request, renderSitemapIndex(entries));
};
