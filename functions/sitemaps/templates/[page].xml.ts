import { and, eq } from 'drizzle-orm';
import {
  sitemap_owner_revisions,
  sitemap_revisions,
  templates,
  users,
} from '../../../db/schema/index';
import { createDb } from '../../api/db';
import type { Env } from '../../api/types';
import {
  bundledTemplateEntries,
  bundledInventoryLastmod,
  catalogPageEntry,
  handlePagedDatabaseSitemap,
  isValidTemplateSlug,
  isValidUsername,
  mostRecentLastmod,
  publicTemplateCondition,
  validTemplateSlugCondition,
  validUsernameCondition,
} from '../../sitemap/shared';

type TemplateRow = {
  username: string | null;
  slug: string | null;
  created_at: string;
  updated_at: string | null;
  owner_updated_at: string | null;
};

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const db = createDb(env);
  const [revision] = await db
    .select({ revised_at: sitemap_revisions.revised_at })
    .from(sitemap_revisions)
    .where(eq(sitemap_revisions.kind, 'templates'))
    .limit(1);
  const landingPage = catalogPageEntry('/templates');
  return handlePagedDatabaseSitemap<TemplateRow>({
    request,
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
    loadRows: async ({ limit, offset }) => await db
      .select({
        username: users.username,
        slug: templates.slug,
        created_at: templates.created_at,
        updated_at: templates.updated_at,
        owner_updated_at: sitemap_owner_revisions.revised_at,
      })
      .from(templates)
      .innerJoin(users, eq(users.id, templates.user_id))
      .leftJoin(sitemap_owner_revisions, eq(sitemap_owner_revisions.user_id, users.id))
      .where(and(publicTemplateCondition, validTemplateSlugCondition, validUsernameCondition))
      .orderBy(templates.id)
      .limit(limit)
      .offset(offset),
    toEntry: (row) => {
      const username = row.username?.trim() ?? '';
      const slug = row.slug?.trim() ?? '';
      return isValidUsername(username) && isValidTemplateSlug(slug) ? ({
        path: `/profile/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
        lastmod: mostRecentLastmod(
          row.updated_at || row.created_at,
          row.owner_updated_at,
        ),
      }) : null;
    },
  });
};
