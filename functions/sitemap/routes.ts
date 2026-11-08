import { eq, sql } from 'drizzle-orm';

import { sitemapProfileRevisions, teams, templates, users } from '../../db/schema/index';
import { createDb } from '../api/db';
import type { Env } from '../api/types';
import { cachedSitemap, type SitemapContext, type SitemapRevisions } from './cache';
import { listedOrganizationCondition, validUsernameCondition } from './listedOwners';
import {
  buildDurableShardIndex,
  bundledInventoryLastmod,
  bundledTemplateEntries,
  catalogPageEntry,
  handleInMemoryPagedSitemap,
  handlePagedDatabaseSitemap,
  loadRowsOfTwoLists,
  loadCategoryEntries,
  methodNotAllowed,
  mostRecentLastmod,
  renderSitemapIndex,
  requestSupportsSitemap,
  selectPublicTemplatesOfListedOwners,
  sitemapImplementationLastmod,
  staticSitemapEntries,
  templateOwnerHandle,
  validTemplateSlugCondition,
  xmlResponse,
  type SitemapEntry,
  type SitemapRowPage,
} from './shared';

export const shardPageParam = (fileName: string): string =>
  /^(\d+)\.xml$/i.exec(fileName)?.[1] ?? fileName;

type Db = ReturnType<typeof createDb>;

type ProfileRow = {
  handle: string;
  created_at: string;
  updated_at: string | null;
  profile_revision: string | null;
};

type TemplateRow = {
  handle: string;
  slug: string;
  created_at: string;
  updated_at: string | null;
  owner_updated_at: string | null;
};

const selectListedUsers = (db: Db) => db
  .select({
    handle: sql<string>`trim(${users.username})`,
    created_at: users.created_at,
    updated_at: users.updated_at,
    profile_revision: sitemapProfileRevisions.revised_at,
  })
  .from(users)
  .leftJoin(sitemapProfileRevisions, eq(sitemapProfileRevisions.user_id, users.id))
  .where(validUsernameCondition)
  .orderBy(users.id);

const selectListedOrganizations = (db: Db) => db
  .select({
    handle: sql<string>`trim(${teams.slug})`,
    created_at: teams.created_at,
    updated_at: teams.updated_at,
    profile_revision: sql<string | null>`null`,
  })
  .from(teams)
  .where(listedOrganizationCondition)
  .orderBy(teams.id);

const countListedUsers = async (db: Db): Promise<number> => await db.$count(users, validUsernameCondition);

const loadListedProfiles = (db: Db, page: SitemapRowPage): Promise<ProfileRow[]> => loadRowsOfTwoLists(
  { load: ({ limit, offset }) => selectListedUsers(db).limit(limit).offset(offset), count: () => countListedUsers(db) },
  ({ limit, offset }) => selectListedOrganizations(db).limit(limit).offset(offset),
  page,
);

const selectListedTemplates = (db: Db) =>
  selectPublicTemplatesOfListedOwners(db, { handle: sql<string>`trim(${templateOwnerHandle})`, slug: sql<string>`trim(${templates.slug})` }, validTemplateSlugCondition)
    .orderBy(templates.id);

const profileEntry = (row: ProfileRow): SitemapEntry => ({
  path: `/profile/${encodeURIComponent(row.handle)}/`,
  lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.profile_revision),
});

const templateEntry = (row: TemplateRow): SitemapEntry => ({
  path: `/profile/${encodeURIComponent(row.handle)}/${encodeURIComponent(row.slug)}/`,
  lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.owner_updated_at),
});

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
  const profiles = [...await selectListedUsers(db), ...await selectListedOrganizations(db)].map(profileEntry);
  const databaseTemplates = (await selectListedTemplates(db)).map(templateEntry);
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
    loadRows: (page) => loadListedProfiles(db, page),
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
