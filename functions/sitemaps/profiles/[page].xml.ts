import { eq } from 'drizzle-orm';
import { sitemap_profile_revisions, users } from '../../../db/schema/index';
import { createDb } from '../../api/db';
import type { Env } from '../../api/types';
import {
  handlePagedDatabaseSitemap,
  isValidUsername,
  mostRecentLastmod,
  validUsernameCondition,
} from '../../sitemap/shared';

type ProfileRow = {
  username: string | null;
  created_at: string;
  updated_at: string | null;
  profile_revision: string | null;
};

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const db = createDb(env);
  return handlePagedDatabaseSitemap<ProfileRow>({
    request,
    params,
    loadRows: async ({ limit, offset }) => await db
      .select({
        username: users.username,
        created_at: users.created_at,
        updated_at: users.updated_at,
        profile_revision: sitemap_profile_revisions.revised_at,
      })
      .from(users)
      .leftJoin(sitemap_profile_revisions, eq(sitemap_profile_revisions.user_id, users.id))
      .where(validUsernameCondition)
      .orderBy(users.id)
      .limit(limit)
      .offset(offset),
    toEntry: (row) => {
      const username = row.username?.trim() ?? '';
      return isValidUsername(username) ? ({
        path: `/profile/${encodeURIComponent(username)}`,
        lastmod: mostRecentLastmod(
          row.updated_at || row.created_at,
          row.profile_revision,
        ),
      }) : null;
    },
  });
};
