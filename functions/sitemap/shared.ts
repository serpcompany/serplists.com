import { and, between, eq, gt, isNotNull, isNull, ne, not, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { createDb, schema } from '../api/db';
import bundledTemplateCatalog from './bundled-catalog.generated.json';
import { PUBLIC_CATEGORY_REGISTRY } from '../../src/data/publicCategories';

export const CANONICAL_ORIGIN = 'https://serplists.com';
export const SITEMAP_PAGE_SIZE = 25_000;

const XML_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=3600',
  'Content-Type': 'application/xml; charset=utf-8',
} as const;

export type SitemapEntry = {
  path: string;
  lastmod?: string | null;
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

const trimmed = (column: SQLWrapper) => sql<string>`trim(${column})`;

export function validUsername(column: SQLWrapper): SQL {
  return and(
    between(sql<number>`length(${trimmed(column)})`, 3, 30),
    not(sql`${trimmed(column)} glob '*[^A-Za-z0-9_.]*'`),
  )!;
}

export function publicTemplate(): SQL {
  return and(
    eq(schema.templates.owner_type, 'user'),
    isNull(schema.templates.team_id),
    eq(schema.templates.is_public, true),
    isNull(schema.templates.deleted_at),
  )!;
}

export function validTemplateSlug(column: SQLWrapper): SQL {
  const value = trimmed(column);
  return and(
    between(sql<number>`length(${value})`, 1, 160),
    eq(value, sql<string>`lower(${value})`),
    not(sql`${value} glob '*[^a-z0-9-]*'`),
    sql`substr(${value}, 1, 1) glob '[a-z0-9]'`,
    sql`substr(${value}, -1, 1) glob '[a-z0-9]'`,
    eq(sql<number>`instr(${value}, '--')`, 0),
  )!;
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function canonicalUrl(path: string): string {
  return new URL(path, CANONICAL_ORIGIN).toString();
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

export function xmlResponse(request: Request, xml: string, status = 200): Response {
  return new Response(request.method === 'HEAD' ? null : xml, {
    status,
    headers: XML_HEADERS,
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
  return Number.isSafeInteger(page) && page >= 1 ? page : null;
}

export function latestLastmod(entries: SitemapEntry[]): string | null {
  const timestamps = entries
    .map((entry) => validLastmod(entry.lastmod))
    .filter((value): value is string => value !== null)
    .sort();
  return timestamps.at(-1) ?? null;
}

export function mostRecentLastmod(...values: Array<string | null | undefined>): string | null {
  return latestLastmod(values.map((lastmod) => ({ path: '/', lastmod })));
}

export function paginateEntries<T>(entries: T[], page: number): T[] {
  const offset = (page - 1) * SITEMAP_PAGE_SIZE;
  return entries.slice(offset, offset + SITEMAP_PAGE_SIZE);
}

export function bundledTemplateEntries(): SitemapEntry[] {
  return bundledTemplates.filter((template) => isValidTemplateSlug(template.slug ?? '')).map((template) => ({
    path: `/profile/serp/${encodeURIComponent(template.slug!.trim())}`,
    lastmod: template.lastmod,
  }));
}

export function staticSitemapEntries(): SitemapEntry[] {
  return staticPages.filter(
    (entry) => entry.path !== '/templates' && entry.path !== '/categories',
  );
}

export function catalogPageEntry(path: '/templates' | '/categories'): SitemapEntry {
  const entry = staticPages.find((page) => page.path === path);
  if (!entry) throw new Error(`Missing generated sitemap metadata for ${path}`);
  return entry;
}

export function isValidUsername(value: string): boolean {
  return value.length >= 3 && value.length <= 30 && /^[A-Za-z0-9_.]+$/.test(value);
}

export function isValidTemplateSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function buildInMemoryShardIndex(
  kind: 'pages' | 'categories',
  entries: SitemapEntry[],
  inventoryLastmod?: string | null,
): SitemapEntry[] {
  const pages = Math.ceil(entries.length / SITEMAP_PAGE_SIZE);
  return Array.from({ length: pages }, (_, index) => {
    const page = index + 1;
    return {
      path: `/sitemaps/${kind}/${page}.xml`,
      lastmod: inventoryLastmod ?? latestLastmod(paginateEntries(entries, page)),
    };
  });
}

type Database = ReturnType<typeof createDb>;

export async function loadSitemapRevisions(db: Database): Promise<Map<string, string>> {
  const rows = await db.select().from(schema.sitemap_revisions);
  return new Map(rows.flatMap((row) => row.kind === null ? [] : [[row.kind, row.revised_at]]));
}

async function contentHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildDurableShardIndex(
  db: Database,
  kind: 'pages' | 'categories' | 'profiles' | 'templates',
  entries: SitemapEntry[],
  familyRevision?: string | null,
): Promise<SitemapEntry[]> {
  const existing = await db.select({
    page: schema.sitemap_shard_revisions.page,
    content_hash: schema.sitemap_shard_revisions.content_hash,
    revised_at: schema.sitemap_shard_revisions.revised_at,
  }).from(schema.sitemap_shard_revisions).where(eq(schema.sitemap_shard_revisions.kind, kind));
  const byPage = new Map(existing.map((row) => [Number(row.page), row]));
  const pageCount = Math.ceil(entries.length / SITEMAP_PAGE_SIZE);
  const shards: SitemapEntry[] = [];
  if (existing.some((row) => Number(row.page) > pageCount)) {
    await db.delete(schema.sitemap_shard_revisions).where(and(
      eq(schema.sitemap_shard_revisions.kind, kind),
      gt(schema.sitemap_shard_revisions.page, pageCount),
    ));
  }

  for (let page = 1; page <= pageCount; page += 1) {
    const pageEntries = paginateEntries(entries, page);
    const hash = await contentHash(renderUrlset(pageEntries));
    const previous = byPage.get(page);
    const revisedAt = previous?.content_hash === hash
      ? previous.revised_at
      : mostRecentLastmod(familyRevision, latestLastmod(pageEntries));
    if (!revisedAt) throw new Error(`Missing revision source for ${kind} sitemap shard ${page}`);
    if (!previous || previous.content_hash !== hash || previous.revised_at !== revisedAt) {
      await db.insert(schema.sitemap_shard_revisions)
        .values({ kind, page, content_hash: hash, revised_at: revisedAt })
        .onConflictDoUpdate({
          target: [schema.sitemap_shard_revisions.kind, schema.sitemap_shard_revisions.page],
          set: { content_hash: hash, revised_at: revisedAt },
        });
    }
    shards.push({ path: `/sitemaps/${kind}/${page}.xml`, lastmod: revisedAt });
  }
  return shards;
}

export function categorySlug(category: string): string {
  return category
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function parseCategories(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Legacy category values may be stored as plain strings.
  }

  return [value];
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

export async function loadCategoryEntries(
  db: Database,
  inventoryLastmod?: string | null,
): Promise<SitemapEntry[]> {
  const rows = await db.select({
    category: schema.templates.category,
    created_at: schema.templates.created_at,
    updated_at: schema.templates.updated_at,
    owner_updated_at: schema.sitemap_owner_revisions.revised_at,
  }).from(schema.templates)
    .innerJoin(schema.users, eq(schema.users.id, schema.templates.user_id))
    .leftJoin(schema.sitemap_owner_revisions, eq(schema.sitemap_owner_revisions.user_id, schema.users.id))
    .where(and(publicTemplate(), isNotNull(schema.templates.category), ne(trimmed(schema.templates.category), '')));
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
  PUBLIC_CATEGORY_REGISTRY.forEach((category) => {
    addCategory(category.slug, catalogPageEntry('/categories').lastmod);
  });
  rows.forEach((row) => {
    const lastmod = mostRecentLastmod(
      row.updated_at || row.created_at,
      row.owner_updated_at,
    );
    parseCategories(row.category).forEach((category) => addCategory(category, lastmod));
  });
  const categoryRevisions = await db.select().from(schema.sitemap_category_revisions);
  categoryRevisions.forEach((row) => {
    if (row.category === null) return;
    parseCategories(row.category).forEach((category) => {
      const slug = categorySlug(category);
      if (lastmodBySlug.has(slug)) addCategory(category, row.revised_at);
    });
  });

  const categoryEntries = Array.from(lastmodBySlug, ([slug, lastmod]) => ({
    path: `/categories/${encodeURIComponent(slug)}`,
    lastmod,
  })).sort((left, right) => left.path.localeCompare(right.path));
  const landingPage = catalogPageEntry('/categories');

  return [
    {
      ...landingPage,
      lastmod: mostRecentLastmod(
        landingPage.lastmod,
        inventoryLastmod,
        ...categoryEntries.map((entry) => entry.lastmod),
      ),
    },
    ...categoryEntries,
  ];
}

type PagedSitemapOptions<Row> = {
  request: Request;
  params: Record<string, string | string[]>;
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
