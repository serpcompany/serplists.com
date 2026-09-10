import type { Env } from './api/types';
import { and, eq } from 'drizzle-orm';
import { createDb, schema } from './api/db';
import {
  buildDurableShardIndex, bundledInventoryLastmod, bundledTemplateEntries,
  catalogPageEntry, isValidTemplateSlug, isValidUsername, loadCategoryEntries,
  loadSitemapRevisions, methodNotAllowed, mostRecentLastmod, publicTemplate,
  renderSitemapIndex, requestSupportsSitemap, staticSitemapEntries,
  sitemapImplementationLastmod,
  validTemplateSlug, validUsername, xmlResponse, type SitemapEntry,
} from './sitemap/shared';

type ProfileRow = { username: string | null; created_at: string; updated_at: string | null; profile_revision: string | null };
type TemplateRow = { username: string | null; slug: string | null; created_at: string; updated_at: string | null; owner_updated_at: string | null };

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();
  const db = createDb(env);
  const profileRows: ProfileRow[] = await db.select({
    username: schema.users.username,
    created_at: schema.users.created_at,
    updated_at: schema.users.updated_at,
    profile_revision: schema.sitemap_profile_revisions.revised_at,
  }).from(schema.users)
    .leftJoin(schema.sitemap_profile_revisions, eq(schema.sitemap_profile_revisions.user_id, schema.users.id))
    .where(validUsername(schema.users.username))
    .orderBy(schema.users.id);
  const profiles = profileRows.flatMap((row): SitemapEntry[] => row.username && isValidUsername(row.username.trim()) ? [{
    path: `/profile/${encodeURIComponent(row.username.trim())}`,
    lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.profile_revision),
  }] : []);

  const templateRows: TemplateRow[] = await db.select({
    username: schema.users.username,
    slug: schema.templates.slug,
    created_at: schema.templates.created_at,
    updated_at: schema.templates.updated_at,
    owner_updated_at: schema.sitemap_owner_revisions.revised_at,
  }).from(schema.templates)
    .innerJoin(schema.users, eq(schema.users.id, schema.templates.user_id))
    .leftJoin(schema.sitemap_owner_revisions, eq(schema.sitemap_owner_revisions.user_id, schema.users.id))
    .where(and(publicTemplate(), validTemplateSlug(schema.templates.slug), validUsername(schema.users.username)))
    .orderBy(schema.templates.id);
  const databaseTemplates = templateRows.flatMap((row): SitemapEntry[] =>
    row.username && row.slug && isValidUsername(row.username.trim()) && isValidTemplateSlug(row.slug.trim()) ? [{
      path: `/profile/${encodeURIComponent(row.username.trim())}/${encodeURIComponent(row.slug.trim())}`,
      lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.owner_updated_at),
    }] : []);

  const categoryEntries = await loadCategoryEntries(db);
  const revisions = await loadSitemapRevisions(db);
  const templateLanding = catalogPageEntry('/templates');
  const templates = [{
    ...templateLanding,
    lastmod: mostRecentLastmod(templateLanding.lastmod, revisions.get('templates'), bundledInventoryLastmod('templates')),
  }, ...bundledTemplateEntries(), ...databaseTemplates];
  const entries = [
    ...await buildDurableShardIndex(db, 'pages', staticSitemapEntries(), sitemapImplementationLastmod()),
    ...await buildDurableShardIndex(db, 'categories', categoryEntries,
      mostRecentLastmod(revisions.get('categories'), bundledInventoryLastmod('categories'), sitemapImplementationLastmod())),
    ...await buildDurableShardIndex(db, 'profiles', profiles,
      mostRecentLastmod(revisions.get('profiles'), sitemapImplementationLastmod())),
    ...await buildDurableShardIndex(db, 'templates', templates,
      mostRecentLastmod(revisions.get('templates'), bundledInventoryLastmod('templates'), sitemapImplementationLastmod())),
  ];
  return xmlResponse(request, renderSitemapIndex(entries));
};
