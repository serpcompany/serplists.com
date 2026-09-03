import type { Env } from '../../api/types';
import {
  handlePagedDatabaseSitemap,
  isValidTemplateSlug,
  isValidUsername,
  PUBLIC_TEMPLATE_SQL_WHERE,
  VALID_TEMPLATE_SLUG_SQL,
  VALID_USERNAME_SQL,
} from '../../sitemap/shared';

type TemplateRow = {
  username: string;
  slug: string;
  created_at: string;
  updated_at: string | null;
};

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  return handlePagedDatabaseSitemap<TemplateRow>({
    request,
    env,
    params,
    sql: `SELECT u.username, t.slug, t.created_at, t.updated_at
       FROM templates AS t
       JOIN users AS u ON u.id = t.user_id
      WHERE ${PUBLIC_TEMPLATE_SQL_WHERE}
        AND ${VALID_TEMPLATE_SLUG_SQL}
        AND ${VALID_USERNAME_SQL}
      ORDER BY t.id
      LIMIT ? OFFSET ?`,
    toEntry: (row) => isValidUsername(row.username.trim()) && isValidTemplateSlug(row.slug.trim()) ? ({
        path: `/profile/${encodeURIComponent(row.username.trim())}/${encodeURIComponent(row.slug.trim())}`,
        lastmod: row.updated_at || row.created_at,
      }) : null,
  });
};
