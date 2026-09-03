import type { Env } from './api/types';
import {
  buildDurableShardIndex, bundledInventoryLastmod, bundledTemplateEntries,
  catalogPageEntry, isValidTemplateSlug, isValidUsername, loadCategoryEntries,
  loadSitemapRevisions, methodNotAllowed, mostRecentLastmod, PUBLIC_TEMPLATE_SQL_WHERE,
  renderSitemapIndex, requestSupportsSitemap, staticSitemapEntries,
  sitemapImplementationLastmod,
  VALID_TEMPLATE_SLUG_SQL, VALID_USERNAME_SQL, xmlResponse, type SitemapEntry,
} from './sitemap/shared';

type ProfileRow = { username: string; created_at: string; updated_at: string | null; profile_revision: string | null };
type TemplateRow = { username: string; slug: string; created_at: string; updated_at: string | null; owner_updated_at: string | null };

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();
  const profileRows = await env.DB.prepare(`SELECT u.username, u.created_at, u.updated_at,
      r.revised_at AS profile_revision FROM users u LEFT JOIN sitemap_profile_revisions r ON r.user_id=u.id
      WHERE ${VALID_USERNAME_SQL} ORDER BY u.id`).all<ProfileRow>();
  const profiles = profileRows.results.flatMap((row): SitemapEntry[] => isValidUsername(row.username.trim()) ? [{
    path: `/profile/${encodeURIComponent(row.username.trim())}`,
    lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.profile_revision),
  }] : []);

  const templateRows = await env.DB.prepare(`SELECT u.username, t.slug, t.created_at, t.updated_at,
      r.revised_at owner_updated_at
      FROM templates t JOIN users u ON u.id=t.user_id
      LEFT JOIN sitemap_owner_revisions r ON r.user_id=u.id
      WHERE ${PUBLIC_TEMPLATE_SQL_WHERE} AND ${VALID_TEMPLATE_SLUG_SQL} AND ${VALID_USERNAME_SQL}
      ORDER BY t.id`).all<TemplateRow>();
  const databaseTemplates = templateRows.results.flatMap((row): SitemapEntry[] =>
    isValidUsername(row.username.trim()) && isValidTemplateSlug(row.slug.trim()) ? [{
      path: `/profile/${encodeURIComponent(row.username.trim())}/${encodeURIComponent(row.slug.trim())}`,
      lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.owner_updated_at),
    }] : []);

  const categoryEntries = await loadCategoryEntries(env);
  const revisions = await loadSitemapRevisions(env);
  const templateLanding = catalogPageEntry('/templates');
  const templates = [{
    ...templateLanding,
    lastmod: mostRecentLastmod(templateLanding.lastmod, revisions.get('templates'), bundledInventoryLastmod('templates')),
  }, ...bundledTemplateEntries(), ...databaseTemplates];
  const entries = [
    ...await buildDurableShardIndex(env, 'pages', staticSitemapEntries(), sitemapImplementationLastmod()),
    ...await buildDurableShardIndex(env, 'categories', categoryEntries,
      mostRecentLastmod(revisions.get('categories'), bundledInventoryLastmod('categories'), sitemapImplementationLastmod())),
    ...await buildDurableShardIndex(env, 'profiles', profiles,
      mostRecentLastmod(revisions.get('profiles'), sitemapImplementationLastmod())),
    ...await buildDurableShardIndex(env, 'templates', templates,
      mostRecentLastmod(revisions.get('templates'), bundledInventoryLastmod('templates'), sitemapImplementationLastmod())),
  ];
  return xmlResponse(request, renderSitemapIndex(entries));
};
