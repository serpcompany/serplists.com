import type { Env } from '../../api/types';
import {
  handlePagedDatabaseSitemap,
  isValidUsername,
  VALID_USERNAME_SQL,
} from '../../sitemap/shared';

type ProfileRow = {
  username: string;
  created_at: string;
  updated_at: string | null;
};

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  return handlePagedDatabaseSitemap<ProfileRow>({
    request,
    env,
    params,
    sql: `SELECT username, created_at, updated_at
       FROM users AS u
      WHERE ${VALID_USERNAME_SQL}
      ORDER BY id
      LIMIT ? OFFSET ?`,
    toEntry: (row) => isValidUsername(row.username.trim()) ? ({
        path: `/profile/${encodeURIComponent(row.username.trim())}`,
        lastmod: row.updated_at || row.created_at,
      }) : null,
  });
};
