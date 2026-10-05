import { and, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import type { SelectedFields, SQLiteColumn } from 'drizzle-orm/sqlite-core';
import {
  sitemapCategoryRevisions,
  sitemapOwnerRevisions,
  sitemapShardRevisions,
  teams,
  templates,
  users,
} from '../../db/schema/index';
import { createDb } from '../api/db';
import { isPublicHandle } from '../../src/lib/schemas/publicHandle';
import type { Env } from '../api/types';
import bundledTemplateCatalog from './bundled-catalog.generated.json';
import { PUBLIC_CATEGORY_REGISTRY } from '../../src/data/publicCategories';
import { categorySlug } from '../../src/lib/categorySlug';
import { buildCanonicalUrl } from '../../src/lib/seo/siteOrigin';

export const SITEMAP_PAGE_SIZE = 25_000;
const SITEMAP_MAX_PAGE = 50_000;

const XML_CACHE_CONTROL = 'public, max-age=300, s-maxage=86400, stale-while-revalidate=3600';

export type SitemapEntry = {
  path: string;
  lastmod?: string | null | undefined;
};

type BundledTemplate = {
  slug?: string;
  categories?: string[];
  lastmod?: string;
};

type StaticPage = {
  path: string;
  lastmod: string;
};

type InventoryMetadata = {
  templatesLastmod?: string;
  categoriesLastmod?: string;
  implementationLastmod?: string;
};

const bundledTemplates = (bundledTemplateCatalog.templates as BundledTemplate[]).filter(
  (template) => template.slug?.trim(),
);

const staticPages = bundledTemplateCatalog.staticPages as StaticPage[];
const inventoryMetadata = (bundledTemplateCatalog as { inventory?: InventoryMetadata }).inventory;

export function bundledInventoryLastmod(kind: 'templates' | 'categories'): string | null {
  return validLastmod(
    kind === 'templates'
      ? inventoryMetadata?.templatesLastmod
      : inventoryMetadata?.categoriesLastmod,
  );
}

export function sitemapImplementationLastmod(): string | null {
  return validLastmod(inventoryMetadata?.implementationLastmod);
}

const validHandleCondition = (column: SQLiteColumn) => sql<boolean>`
  length(trim(${column})) between 3 and 30
  and trim(${column}) not glob ${'*[^A-Za-z0-9_.-]*'}`;

export const validUsernameCondition = validHandleCondition(users.username);

export const validOrganizationHandleCondition = validHandleCondition(teams.slug);

const isPersonalTemplate = and(eq(templates.owner_type, 'user'), isNull(templates.team_id));

const isOrganizationTemplate = and(eq(templates.owner_type, 'team'), isNotNull(templates.team_id), ne(templates.team_id, ''));

const publicTemplateCondition = and(eq(templates.is_public, true), isNull(templates.deleted_at));

const listedTemplateOwnerCondition = or(
  and(isPersonalTemplate, validUsernameCondition),
  and(isOrganizationTemplate, isNull(teams.archived_at), validOrganizationHandleCondition),
);

export const templateOwnerHandle = sql<string | null>`coalesce(${teams.slug}, ${users.username})`;

export const validTemplateSlugCondition = sql<boolean>`
  length(trim(${templates.slug})) between 1 and 160
  and trim(${templates.slug}) = lower(trim(${templates.slug}))
  and trim(${templates.slug}) not glob ${'*[^a-z0-9-]*'}
  and substr(trim(${templates.slug}), 1, 1) glob ${'[a-z0-9]'}
  and substr(trim(${templates.slug}), -1, 1) glob ${'[a-z0-9]'}
  and instr(trim(${templates.slug}), ${'--'}) = 0`;

const nonEmptyTemplateCategoryCondition = sql<boolean>`trim(${templates.category}) <> ${''}`;

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function canonicalUrl(path: string): string {
  return buildCanonicalUrl(path);
}

function validLastmod(value?: string | null): string | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value.trim())
    ? `${value.trim().replace(' ', 'T')}Z`
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function renderUrlset(entries: SitemapEntry[]): string {
  const urls = entries
    .map(({ path, lastmod }) => {
      const normalizedLastmod = validLastmod(lastmod);
      const lastmodElement = normalizedLastmod
        ? `\n    <lastmod>${normalizedLastmod}</lastmod>`
        : '';
      return `  <url>\n    <loc>${xmlEscape(canonicalUrl(path))}</loc>${lastmodElement}\n  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function renderSitemapIndex(entries: SitemapEntry[]): string {
  const sitemaps = entries
    .map(({ path, lastmod }) => {
      const normalizedLastmod = validLastmod(lastmod);
      const lastmodElement = normalizedLastmod
        ? `\n    <lastmod>${normalizedLastmod}</lastmod>`
        : '';
      return `  <sitemap>\n    <loc>${xmlEscape(canonicalUrl(path))}</loc>${lastmodElement}\n  </sitemap>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps}\n</sitemapindex>\n`;
}

export function xmlResponse(
  request: Request,
  xml: string,
  status = 200,
  cacheControl = XML_CACHE_CONTROL,
): Response {
  return new Response(request.method === 'HEAD' ? null : xml, {
    status,
    headers: { 'Cache-Control': cacheControl, 'Content-Type': 'application/xml; charset=utf-8' },
  });
}

export function methodNotAllowed(): Response {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'GET, HEAD' },
  });
}

export function parsePage(value: string | string[] | undefined): number | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !/^\d+$/.test(candidate)) return null;
  const page = Number(candidate);
  return Number.isSafeInteger(page) && page >= 1 && page <= SITEMAP_MAX_PAGE ? page : null;
}

function latestLastmod(entries: SitemapEntry[]): string | null {
  const timestamps = entries
    .map((entry) => validLastmod(entry.lastmod))
    .filter((value): value is string => value !== null)
    .sort();
  return timestamps.at(-1) ?? null;
}

export function mostRecentLastmod(...values: Array<string | null | undefined>): string | null {
  return latestLastmod(values.map((lastmod) => ({ path: '/', lastmod })));
}

function paginateEntries<T>(entries: T[], page: number): T[] {
  const offset = (page - 1) * SITEMAP_PAGE_SIZE;
  return entries.slice(offset, offset + SITEMAP_PAGE_SIZE);
}

export function bundledTemplateEntries(): SitemapEntry[] {
  return bundledTemplates.flatMap((template) => {
    const slug = template.slug ?? '';
    return isValidTemplateSlug(slug)
      ? [{ path: `/profile/serp/${encodeURIComponent(slug.trim())}/`, lastmod: template.lastmod }]
      : [];
  });
}

export function staticSitemapEntries(): SitemapEntry[] {
  return staticPages.filter(
    (entry) => entry.path !== '/templates/' && entry.path !== '/categories/',
  );
}

export function catalogPageEntry(path: '/templates/' | '/categories/'): SitemapEntry {
  const entry = staticPages.find((page) => page.path === path);
  if (!entry) throw new Error(`Missing generated sitemap metadata for ${path}`);
  return entry;
}

export const isValidUsername = isPublicHandle;

export function isValidTemplateSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export async function contentHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type ExistingShardRevision = {
  page: number;
  content_hash: string;
  revised_at: string;
};

type ShardRevisionUpsert = ExistingShardRevision & {
  kind: 'pages' | 'categories' | 'profiles' | 'templates';
};

export async function planDurableShardIndex(
  kind: ShardRevisionUpsert['kind'],
  entries: SitemapEntry[],
  existing: ExistingShardRevision[],
  familyRevision?: string | null,
): Promise<{
  shards: SitemapEntry[];
  stalePages: number[];
  upserts: ShardRevisionUpsert[];
}> {
  const byPage = new Map(existing.map((row) => [Number(row.page), row]));
  const pageCount = Math.ceil(entries.length / SITEMAP_PAGE_SIZE);
  const stalePages = existing
    .map((row) => Number(row.page))
    .filter((page) => page > pageCount)
    .sort((left, right) => left - right);
  const shards: SitemapEntry[] = [];
  const upserts: ShardRevisionUpsert[] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    const pageEntries = paginateEntries(entries, page);
    const hash = await contentHash(renderUrlset(pageEntries));
    const previous = byPage.get(page);
    const revisedAt = previous?.content_hash === hash
      ? previous.revised_at
      : mostRecentLastmod(familyRevision, latestLastmod(pageEntries));
    if (!revisedAt) throw new Error(`Missing revision source for ${kind} sitemap shard ${page}`);
    if (!previous || previous.content_hash !== hash || previous.revised_at !== revisedAt) {
      upserts.push({ kind, page, content_hash: hash, revised_at: revisedAt });
    }
    shards.push({ path: `/sitemaps/${kind}/${page}.xml`, lastmod: revisedAt });
  }

  return { shards, stalePages, upserts };
}

export async function buildDurableShardIndex(
  env: Env,
  kind: 'pages' | 'categories' | 'profiles' | 'templates',
  entries: SitemapEntry[],
  familyRevision?: string | null,
): Promise<SitemapEntry[]> {
  const db = createDb(env);
  const existing = await db
    .select({
      page: sitemapShardRevisions.page,
      content_hash: sitemapShardRevisions.content_hash,
      revised_at: sitemapShardRevisions.revised_at,
    })
    .from(sitemapShardRevisions)
    .where(eq(sitemapShardRevisions.kind, kind));
  const plan = await planDurableShardIndex(kind, entries, existing, familyRevision);
  if (plan.stalePages.length > 0) {
    await db
      .delete(sitemapShardRevisions)
      .where(and(
        eq(sitemapShardRevisions.kind, kind),
        inArray(sitemapShardRevisions.page, plan.stalePages),
      ));
  }

  for (const upsert of plan.upserts) {
    await db
      .insert(sitemapShardRevisions)
      .values(upsert)
      .onConflictDoUpdate({
        target: [sitemapShardRevisions.kind, sitemapShardRevisions.page],
        set: { content_hash: upsert.content_hash, revised_at: upsert.revised_at },
      });
  }
  return plan.shards;
}

export { categorySlug };

function parseJsonOrNull(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseCategories(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  const parsed = parseJsonOrNull(value);
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [value];
}

export function requestSupportsSitemap(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

export async function handleInMemoryPagedSitemap(
  request: Request,
  pageValue: string | string[] | undefined,
  loadEntries: () => SitemapEntry[] | Promise<SitemapEntry[]>,
): Promise<Response> {
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();
  const page = parsePage(pageValue);
  if (!page) return xmlResponse(request, renderUrlset([]), 404);
  const pageEntries = paginateEntries(await loadEntries(), page);

  return pageEntries.length === 0
    ? xmlResponse(request, renderUrlset([]), 404)
    : xmlResponse(request, renderUrlset(pageEntries));
}

export function selectPublicTemplatesOfListedOwners<Fields extends SelectedFields>(
  db: ReturnType<typeof createDb>,
  fields: Fields,
  ...conditions: SQL[]
) {
  return db
    .select({
      ...fields,
      created_at: templates.created_at,
      updated_at: templates.updated_at,
      owner_updated_at: sitemapOwnerRevisions.revised_at,
    })
    .from(templates)
    .leftJoin(users, and(isPersonalTemplate, eq(users.id, templates.user_id)))
    .leftJoin(teams, and(isOrganizationTemplate, eq(teams.id, templates.team_id)))
    .leftJoin(sitemapOwnerRevisions, eq(sitemapOwnerRevisions.user_id, users.id))
    .where(and(publicTemplateCondition, listedTemplateOwnerCondition, ...conditions));
}

export async function loadCategoryEntries(env: Env): Promise<SitemapEntry[]> {
  const db = createDb(env);
  const rows = await selectPublicTemplatesOfListedOwners(
    db,
    { category: templates.category },
    isNotNull(templates.category),
    nonEmptyTemplateCategoryCondition,
  );
  const lastmodBySlug = new Map<string, string | null>();
  const addCategory = (category: string, lastmod: string | null | undefined) => {
    const slug = categorySlug(category);
    if (!slug) return;
    lastmodBySlug.set(
      slug,
      mostRecentLastmod(lastmodBySlug.get(slug), lastmod),
    );
  };

  bundledTemplates.forEach((template) => {
    template.categories?.forEach((category) => addCategory(category, template.lastmod));
  });
  rows.forEach((row) => {
    const lastmod = mostRecentLastmod(
      row.updated_at || row.created_at,
      row.owner_updated_at,
    );
    parseCategories(row.category).forEach((category) => addCategory(category, lastmod));
  });
  PUBLIC_CATEGORY_REGISTRY.forEach((category) => {
    if (lastmodBySlug.has(category.slug)) addCategory(category.slug, catalogPageEntry('/categories/').lastmod);
  });
  const categoryRevisions = await db
    .select({
      category: sitemapCategoryRevisions.category,
      revised_at: sitemapCategoryRevisions.revised_at,
    })
    .from(sitemapCategoryRevisions);
  let categoryRevisedAt: string | null = null;
  for (const row of categoryRevisions) {
    const categories = parseCategories(row.category).filter((category) => categorySlug(category));
    if (categories.length === 0) continue;
    categoryRevisedAt = mostRecentLastmod(categoryRevisedAt, row.revised_at);
    categories.forEach((category) => {
      if (lastmodBySlug.has(categorySlug(category))) addCategory(category, row.revised_at);
    });
  }

  const categoryEntries = Array.from(lastmodBySlug, ([slug, lastmod]) => ({
    path: `/categories/${encodeURIComponent(slug)}/`,
    lastmod,
  })).sort((left, right) => left.path.localeCompare(right.path));
  const landingPage = catalogPageEntry('/categories/');

  return [
    {
      ...landingPage,
      lastmod: mostRecentLastmod(
        landingPage.lastmod,
        bundledInventoryLastmod('categories'),
        categoryRevisedAt,
        ...categoryEntries.map((entry) => entry.lastmod),
      ),
    },
    ...categoryEntries,
  ];
}

type PagedSitemapOptions<Row> = {
  request: Request;
  params: { readonly page?: string | string[] | undefined };
  loadRows: (pagination: { limit: number; offset: number }) => Promise<Row[]>;
  toEntry: (row: Row) => SitemapEntry | null;
  prefixEntries?: SitemapEntry[];
};

export async function handlePagedDatabaseSitemap<Row>({
  request,
  params,
  loadRows,
  toEntry,
  prefixEntries = [],
}: PagedSitemapOptions<Row>): Promise<Response> {
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();
  const page = parsePage(params.page);
  if (!page) return xmlResponse(request, renderUrlset([]), 404);

  const offset = (page - 1) * SITEMAP_PAGE_SIZE;
  const prefixedPageEntries = prefixEntries.slice(offset, offset + SITEMAP_PAGE_SIZE);
  const databaseLimit = SITEMAP_PAGE_SIZE - prefixedPageEntries.length;
  const databaseOffset = Math.max(0, offset - prefixEntries.length);
  const rows = databaseLimit > 0
    ? await loadRows({ limit: databaseLimit, offset: databaseOffset })
    : [];
  const databaseEntries = rows
    .map(toEntry)
    .filter((entry): entry is SitemapEntry => entry !== null);
  const entries = [...prefixedPageEntries, ...databaseEntries];

  return entries.length === 0
    ? xmlResponse(request, renderUrlset([]), 404)
    : xmlResponse(request, renderUrlset(entries));
}
