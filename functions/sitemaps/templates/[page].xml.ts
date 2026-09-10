import type { Env } from '../../api/types';
import { and, eq } from 'drizzle-orm';
import { createDb, schema } from '../../api/db';
import {
  bundledTemplateEntries,
  bundledInventoryLastmod,
  catalogPageEntry,
  handlePagedDatabaseSitemap,
  isValidTemplateSlug,
  isValidUsername,
  mostRecentLastmod,
  publicTemplate,
  validTemplateSlug,
  validUsername,
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
  const [revision] = await db.select({ revised_at: schema.sitemap_revisions.revised_at })
    .from(schema.sitemap_revisions)
    .where(eq(schema.sitemap_revisions.kind, 'templates'))
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
    loadRows: ({ limit, offset }) => db.select({
      username: schema.users.username,
      slug: schema.templates.slug,
      created_at: schema.templates.created_at,
      updated_at: schema.templates.updated_at,
      owner_updated_at: schema.sitemap_owner_revisions.revised_at,
    }).from(schema.templates)
      .innerJoin(schema.users, eq(schema.users.id, schema.templates.user_id))
      .leftJoin(schema.sitemap_owner_revisions, eq(schema.sitemap_owner_revisions.user_id, schema.users.id))
      .where(and(publicTemplate(), validTemplateSlug(schema.templates.slug), validUsername(schema.users.username)))
      .orderBy(schema.templates.id)
      .limit(limit)
      .offset(offset),
    toEntry: (row) => row.username && row.slug && isValidUsername(row.username.trim()) && isValidTemplateSlug(row.slug.trim()) ? ({
        path: `/profile/${encodeURIComponent(row.username.trim())}/${encodeURIComponent(row.slug.trim())}`,
        lastmod: mostRecentLastmod(
          row.updated_at || row.created_at,
          row.owner_updated_at,
        ),
      }) : null,
  });
};
