import type { Env } from '../../api/types';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '../../api/db';
import {
  handlePagedDatabaseSitemap,
  isValidUsername,
  mostRecentLastmod,
  validUsername,
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
    loadRows: ({ limit, offset }) => db.select({
      username: schema.users.username,
      created_at: schema.users.created_at,
      updated_at: schema.users.updated_at,
      profile_revision: schema.sitemap_profile_revisions.revised_at,
    }).from(schema.users)
      .leftJoin(schema.sitemap_profile_revisions, eq(schema.sitemap_profile_revisions.user_id, schema.users.id))
      .where(validUsername(schema.users.username))
      .orderBy(schema.users.id)
      .limit(limit)
      .offset(offset),
    toEntry: (row) => row.username && isValidUsername(row.username.trim()) ? ({
        path: `/profile/${encodeURIComponent(row.username.trim())}`,
        lastmod: mostRecentLastmod(
          row.updated_at || row.created_at,
          row.profile_revision,
        ),
      }) : null,
  });
};
