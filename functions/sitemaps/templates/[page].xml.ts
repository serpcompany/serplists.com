import type { Env } from '../../api/types';
import {
  bundledTemplateEntries,
  bundledInventoryLastmod,
  catalogPageEntry,
  handlePagedDatabaseSitemap,
  isValidTemplateSlug,
  isValidUsername,
  mostRecentLastmod,
  PUBLIC_TEMPLATE_SQL_WHERE,
  VALID_TEMPLATE_SLUG_SQL,
  VALID_USERNAME_SQL,
} from '../../sitemap/shared';

type TemplateRow = {
  username: string;
  slug: string;
  created_at: string;
  updated_at: string | null;
  owner_updated_at: string | null;
};

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const revision = await env.DB.prepare(
    `SELECT revised_at FROM sitemap_revisions WHERE kind = 'templates'`,
  ).first<{ revised_at: string }>();
  const landingPage = catalogPageEntry('/templates');
  return handlePagedDatabaseSitemap<TemplateRow>({
    request,
    env,
    params,
    prefixEntries: [
      {
        ...landingPage,
        lastmod: mostRecentLastmod(
          landingPage.lastmod,
          bundledInventoryLastmod('templates'),
          revision?.revised_at,
        ),
      },
      ...bundledTemplateEntries(),
    ],
    sql: `SELECT u.username, t.slug, t.created_at, t.updated_at,
                r.revised_at AS owner_updated_at
       FROM templates AS t
       JOIN users AS u ON u.id = t.user_id
       LEFT JOIN sitemap_owner_revisions AS r ON r.user_id = u.id
      WHERE ${PUBLIC_TEMPLATE_SQL_WHERE}
        AND ${VALID_TEMPLATE_SLUG_SQL}
        AND ${VALID_USERNAME_SQL}
      ORDER BY t.id
      LIMIT ? OFFSET ?`,
    toEntry: (row) => isValidUsername(row.username.trim()) && isValidTemplateSlug(row.slug.trim()) ? ({
        path: `/profile/${encodeURIComponent(row.username.trim())}/${encodeURIComponent(row.slug.trim())}`,
        lastmod: mostRecentLastmod(
          row.updated_at || row.created_at,
          row.owner_updated_at,
        ),
      }) : null,
  });
};
