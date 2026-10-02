import { eq } from 'drizzle-orm';

import { sitemap_profile_revisions, templates, users } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';
import { cachedSitemap, type SitemapContext, type SitemapRevisions } from './cache';
import {
  buildDurableShardIndex,
  bundledInventoryLastmod,
  bundledTemplateEntries,
  catalogPageEntry,
  handleInMemoryPagedSitemap,
  handlePagedDatabaseSitemap,
  isValidTemplateSlug,
  isValidUsername,
  loadCategoryEntries,
  methodNotAllowed,
  mostRecentLastmod,
  renderSitemapIndex,
  requestSupportsSitemap,
  selectPublicTemplatesOfListedOwners,
  sitemapImplementationLastmod,
  staticSitemapEntries,
  validTemplateSlugCondition,
  validUsernameCondition,
  xmlResponse,
  type SitemapEntry,
} from './shared';

export const shardPageParam = (fileName: string): string =>
  /^(\d+)\.xml$/i.exec(fileName)?.[1] ?? fileName;

type Db = ReturnType<typeof createDb>;

type ProfileRow = {
  username: string | null;
  created_at: string;
  updated_at: string | null;
  profile_revision: string | null;
};

type TemplateRow = {
  username: string | null;
  slug: string | null;
  created_at: string;
  updated_at: string | null;
  owner_updated_at: string | null;
};

const selectListedProfiles = (db: Db) => db
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

const selectListedTemplates = (db: Db) =>
  selectPublicTemplatesOfListedOwners(db, { username: users.username, slug: templates.slug }, validTemplateSlugCondition)
    .orderBy(templates.id);

function profileEntry(row: ProfileRow): SitemapEntry | null {
  const username = row.username?.trim() ?? '';
  return isValidUsername(username) ? {
    path: `/profile/${encodeURIComponent(username)}/`,
    lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.profile_revision),
  } : null;
}

function templateEntry(row: TemplateRow): SitemapEntry | null {
  const username = row.username?.trim() ?? '';
  const slug = row.slug?.trim() ?? '';
  return isValidUsername(username) && isValidTemplateSlug(slug) ? {
    path: `/profile/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/`,
    lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.owner_updated_at),
  } : null;
}

const entriesOf = <Row>(rows: Row[], toEntry: (row: Row) => SitemapEntry | null): SitemapEntry[] =>
  rows.flatMap((row) => toEntry(row) ?? []);

function templateCatalogEntries(revisions: SitemapRevisions): SitemapEntry[] {
  const landingPage = catalogPageEntry('/templates/');
  return [{
    ...landingPage,
    lastmod: mostRecentLastmod(landingPage.lastmod, revisions.get('templates'), bundledInventoryLastmod('templates')),
  }, ...bundledTemplateEntries()];
}

export const serveSitemapIndex = (context: SitemapContext): Promise<Response> =>
  cachedSitemap(context, (request, revisions) => buildSitemapIndex(request, context.env, revisions), 'index');

async function buildSitemapIndex(request: Request, env: Env, revisions: SitemapRevisions): Promise<Response> {
  const db = createDb(env);
  const profiles = entriesOf(await selectListedProfiles(db), profileEntry);
  const databaseTemplates = entriesOf(await selectListedTemplates(db), templateEntry);
  const categoryEntries = await loadCategoryEntries(env);
  const templateEntries = [...templateCatalogEntries(revisions), ...databaseTemplates];
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

export const servePagesSitemap = (request: Request, page: string): Promise<Response> =>
  handleInMemoryPagedSitemap(request, page, staticSitemapEntries);

export const serveCategoriesSitemap = (context: SitemapContext, page: string): Promise<Response> =>
  cachedSitemap(context, (request) => handleInMemoryPagedSitemap(
    request,
    page,
    () => loadCategoryEntries(context.env),
  ), { kind: 'categories', page });

export const serveProfilesSitemap = (context: SitemapContext, page: string): Promise<Response> => {
  const db = createDb(context.env);
  return cachedSitemap(context, (request) => handlePagedDatabaseSitemap<ProfileRow>({
    request,
    params: { page },
    loadRows: async ({ limit, offset }) => await selectListedProfiles(db).limit(limit).offset(offset),
    toEntry: profileEntry,
  }), { kind: 'profiles', page });
};

export const serveTemplatesSitemap = (context: SitemapContext, page: string): Promise<Response> => {
  const db = createDb(context.env);
  return cachedSitemap(context, (request, revisions) => handlePagedDatabaseSitemap<TemplateRow>({
    request,
    params: { page },
    prefixEntries: templateCatalogEntries(revisions),
    loadRows: async ({ limit, offset }) => await selectListedTemplates(db).limit(limit).offset(offset),
    toEntry: templateEntry,
  }), { kind: 'templates', page });
};

export const redirectLegacySitemap = (request: Request, shard: 'pages' | 'categories'): Response => {
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();
  const legacyPage = new URL(request.url).searchParams.get('page');
  const page = legacyPage && /^\d+$/.test(legacyPage) && Number(legacyPage) >= 1
    ? legacyPage
    : '1';
  return Response.redirect(`https://serplists.com/sitemaps/${shard}/${page}.xml`, 308);
};
