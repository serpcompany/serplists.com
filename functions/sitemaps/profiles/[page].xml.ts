import type { Env } from '../../api/types';
import {
  handlePagedDatabaseSitemap,
  isValidUsername,
  mostRecentLastmod,
  VALID_USERNAME_SQL,
} from '../../sitemap/shared';

type ProfileRow = {
  username: string;
  created_at: string;
  updated_at: string | null;
  profile_revision: string | null;
};

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  return handlePagedDatabaseSitemap<ProfileRow>({
    request,
    env,
    params,
    sql: `SELECT u.username, u.created_at, u.updated_at,
                 r.revised_at AS profile_revision
       FROM users AS u
       LEFT JOIN sitemap_profile_revisions AS r ON r.user_id = u.id
      WHERE ${VALID_USERNAME_SQL}
      ORDER BY id
      LIMIT ? OFFSET ?`,
    toEntry: (row) => isValidUsername(row.username.trim()) ? ({
        path: `/profile/${encodeURIComponent(row.username.trim())}`,
        lastmod: mostRecentLastmod(
          row.updated_at || row.created_at,
          row.profile_revision,
        ),
      }) : null,
  });
};
