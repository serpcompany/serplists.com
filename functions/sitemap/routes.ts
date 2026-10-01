import { and, eq } from 'drizzle-orm';

import { sitemap_owner_revisions, sitemap_profile_revisions, templates, users } from '../../db/schema/index';
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
  publicTemplateCondition,
  renderSitemapIndex,
  requestSupportsSitemap,
  sitemapImplementationLastmod,
  staticSitemapEntries,
  validTemplateSlugCondition,
  validUsernameCondition,
  xmlResponse,
  type SitemapEntry,
} from './shared';

export const shardPageParam = (fileName: string): string =>
  /^(\d+)\.xml$/i.exec(fileName)?.[1] ?? fileName;

export const serveSitemapIndex = (context: SitemapContext): Promise<Response> =>
  cachedSitemap(context, (request, revisions) => buildSitemapIndex(request, context.env, revisions), 'index');

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
      path: `/profile/${encodeURIComponent(username)}/`,
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
      path: `/profile/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/`,
      lastmod: mostRecentLastmod(row.updated_at || row.created_at, row.owner_updated_at),
    }] : [];
  });

  const categoryEntries = await loadCategoryEntries(env);
  const templateLanding = catalogPageEntry('/templates/');
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

export const servePagesSitemap = (request: Request, page: string): Promise<Response> =>
  handleInMemoryPagedSitemap(request, page, staticSitemapEntries);

export const serveCategoriesSitemap = (context: SitemapContext, page: string): Promise<Response> =>
  cachedSitemap(context, (request) => handleInMemoryPagedSitemap(
    request,
    page,
    () => loadCategoryEntries(context.env),
  ), { kind: 'categories', page });

type ProfileRow = {
  username: string | null;
  created_at: string;
  updated_at: string | null;
  profile_revision: string | null;
};

export const serveProfilesSitemap = (context: SitemapContext, page: string): Promise<Response> => {
  const db = createDb(context.env);
  return cachedSitemap(context, (request) => handlePagedDatabaseSitemap<ProfileRow>({
    request,
    params: { page },
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
        path: `/profile/${encodeURIComponent(username)}/`,
        lastmod: mostRecentLastmod(
          row.updated_at || row.created_at,
          row.profile_revision,
        ),
      }) : null;
    },
  }), { kind: 'profiles', page });
};

type TemplateRow = {
  username: string | null;
  slug: string | null;
  created_at: string;
  updated_at: string | null;
  owner_updated_at: string | null;
};

export const serveTemplatesSitemap = (context: SitemapContext, page: string): Promise<Response> => {
  const db = createDb(context.env);
  const landingPage = catalogPageEntry('/templates/');
  return cachedSitemap(context, (request, revisions) => handlePagedDatabaseSitemap<TemplateRow>({
    request,
    params: { page },
    prefixEntries: [
      {
        ...landingPage,
        lastmod: mostRecentLastmod(
          landingPage.lastmod,
          bundledInventoryLastmod('templates'),
          revisions.get('templates'),
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
        path: `/profile/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/`,
        lastmod: mostRecentLastmod(
          row.updated_at || row.created_at,
          row.owner_updated_at,
        ),
      }) : null;
    },
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
