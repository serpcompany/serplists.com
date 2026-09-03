import type { Env } from './api/types';
import {
  buildInMemoryShardIndex,
  loadCategoryEntries,
  methodNotAllowed,
  PUBLIC_TEMPLATE_SQL_WHERE,
  renderSitemapIndex,
  requestSupportsSitemap,
  SITEMAP_PAGE_SIZE,
  staticSitemapEntries,
  VALID_TEMPLATE_SLUG_SQL,
  VALID_USERNAME_SQL,
  xmlResponse,
} from './sitemap/shared';

async function countRows(env: Env, sql: string): Promise<number> {
  const row = await env.DB.prepare(sql).first<{ count: number }>();
  const count = Number(row?.count ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

function buildDatabaseShardIndex(
  kind: 'profiles' | 'templates',
  count: number,
) {
  return Array.from(
    { length: Math.ceil(count / SITEMAP_PAGE_SIZE) },
    (_, index) => ({ path: `/sitemaps/${kind}/${index + 1}.xml` }),
  );
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();

  const profileCount = await countRows(
    env,
    `SELECT COUNT(*) AS count
       FROM users AS u
      WHERE ${VALID_USERNAME_SQL}`,
  );
  const templateCount = await countRows(
    env,
    `SELECT COUNT(*) AS count
       FROM templates AS t
       JOIN users AS u ON u.id = t.user_id
      WHERE ${PUBLIC_TEMPLATE_SQL_WHERE}
        AND ${VALID_TEMPLATE_SLUG_SQL}
        AND ${VALID_USERNAME_SQL}`,
  );
  const categoryEntries = await loadCategoryEntries(env);
  const entries = [
    ...buildInMemoryShardIndex('static', staticSitemapEntries()),
    ...buildInMemoryShardIndex('categories', categoryEntries),
    ...buildDatabaseShardIndex('profiles', profileCount),
    ...buildDatabaseShardIndex('templates', templateCount),
  ];

  return xmlResponse(request, renderSitemapIndex(entries));
};
