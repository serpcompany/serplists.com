import { and, eq } from 'drizzle-orm';
import {
  sitemap_owner_revisions,
  sitemap_profile_revisions,
  templates,
  users,
} from '../db/schema/index';
import { createDb } from './api/db';
import type { Env } from './api/types';
import {
  buildDurableShardIndex, bundledInventoryLastmod, bundledTemplateEntries,
  catalogPageEntry, isValidTemplateSlug, isValidUsername, loadCategoryEntries,
  mostRecentLastmod, publicTemplateCondition,
  renderSitemapIndex, staticSitemapEntries,
  sitemapImplementationLastmod,
  validTemplateSlugCondition, validUsernameCondition, xmlResponse,
  type SitemapEntry,
} from './sitemap/shared';
import { cachedSitemap, type SitemapRevisions } from './sitemap/cache';

export const onRequest: PagesFunction<Env> = async (context) =>
  cachedSitemap(context, (request, revisions) => buildSitemapIndex(request, context.env, revisions));

async function buildSitemapIndex(request: Request, env: Env, revisions: SitemapRevisions): Promise<Response> {
  const db = createDb(env);
  const profileRows = await db
    .select({
      username: users.username,
      created_at: users.created_at,
      updated_at: users.updated_at,
      profile_revision: sitemap_profile_revisions.revised_at,
    })
    .from(users)
    .leftJoin(sitemap_profile_revisions, eq(sitemap_profile_revisions.user_id, users.id))
    .where(validUsernameCondition)
    .orderBy(users.id);
  const profiles = profileRows.flatMap((row): SitemapEntry[] => {
    const username = row.username?.trim() ?? '';
    return isValidUsername(username) ? [{
      path: `/profile/${encodeURIComponent(username)}`,
      lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.profile_revision),
    }] : [];
  });

  const templateRows = await db
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
    .orderBy(templates.id);
  const databaseTemplates = templateRows.flatMap((row): SitemapEntry[] => {
    const username = row.username?.trim() ?? '';
    const slug = row.slug?.trim() ?? '';
    return isValidUsername(username) && isValidTemplateSlug(slug) ? [{
      path: `/profile/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
      lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.owner_updated_at),
    }] : [];
  });

  const categoryEntries = await loadCategoryEntries(env);
  const templateLanding = catalogPageEntry('/templates');
  const templateEntries = [{
    ...templateLanding,
    lastmod: mostRecentLastmod(templateLanding.lastmod, revisions.get('templates'), bundledInventoryLastmod('templates')),
  }, ...bundledTemplateEntries(), ...databaseTemplates];
  const entries = [
    ...await buildDurableShardIndex(env, 'pages', staticSitemapEntries(), sitemapImplementationLastmod()),
    ...await buildDurableShardIndex(env, 'categories', categoryEntries,
      mostRecentLastmod(revisions.get('categories'), bundledInventoryLastmod('categories'), sitemapImplementationLastmod())),
    ...await buildDurableShardIndex(env, 'profiles', profiles,
      mostRecentLastmod(revisions.get('profiles'), sitemapImplementationLastmod())),
    ...await buildDurableShardIndex(env, 'templates', templateEntries,
      mostRecentLastmod(revisions.get('templates'), bundledInventoryLastmod('templates'), sitemapImplementationLastmod())),
  ];
  return xmlResponse(request, renderSitemapIndex(entries));
}
