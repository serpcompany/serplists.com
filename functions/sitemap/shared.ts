import type { Env } from '../api/types';
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

export const VALID_USERNAME_SQL = `
  LENGTH(TRIM(u.username)) BETWEEN 3 AND 30
  AND TRIM(u.username) NOT GLOB '*[^A-Za-z0-9_.]*'`;

export const PUBLIC_TEMPLATE_SQL_WHERE = `
  t.owner_type = 'user'
  AND t.team_id IS NULL
  AND t.is_public = 1
  AND t.deleted_at IS NULL`;

export const VALID_TEMPLATE_SLUG_SQL = `
  LENGTH(TRIM(t.slug)) BETWEEN 1 AND 160
  AND TRIM(t.slug) = LOWER(TRIM(t.slug))
  AND TRIM(t.slug) NOT GLOB '*[^a-z0-9-]*'
  AND SUBSTR(TRIM(t.slug), 1, 1) GLOB '[a-z0-9]'
  AND SUBSTR(TRIM(t.slug), -1, 1) GLOB '[a-z0-9]'
  AND INSTR(TRIM(t.slug), '--') = 0`;

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

export async function loadSitemapRevisions(env: Env): Promise<Map<string, string>> {
  const result = await env.DB.prepare(
    `SELECT kind, revised_at FROM sitemap_revisions`,
  ).all<{ kind: string; revised_at: string }>();
  return new Map(result.results.map((row) => [row.kind, row.revised_at]));
}

async function contentHash(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildDurableShardIndex(
  env: Env,
  kind: 'pages' | 'categories' | 'profiles' | 'templates',
  entries: SitemapEntry[],
  familyRevision?: string | null,
): Promise<SitemapEntry[]> {
  const existing = await env.DB.prepare(
    `SELECT page, content_hash, revised_at FROM sitemap_shard_revisions WHERE kind = ?`,
  ).bind(kind).all<{ page: number; content_hash: string; revised_at: string }>();
  const byPage = new Map(existing.results.map((row) => [Number(row.page), row]));
  const pageCount = Math.ceil(entries.length / SITEMAP_PAGE_SIZE);
  const shards: SitemapEntry[] = [];
  if (existing.results.some((row) => Number(row.page) > pageCount)) {
    await env.DB.prepare(
      `DELETE FROM sitemap_shard_revisions WHERE kind = ? AND page > ?`,
    ).bind(kind, pageCount).run();
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
      await env.DB.prepare(
        `INSERT INTO sitemap_shard_revisions(kind, page, content_hash, revised_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(kind, page) DO UPDATE SET
           content_hash = excluded.content_hash,
           revised_at = excluded.revised_at`,
      ).bind(kind, page, hash, revisedAt).run();
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
  env: Env,
  inventoryLastmod?: string | null,
): Promise<SitemapEntry[]> {
  const result = await env.DB.prepare(
    `SELECT t.category, t.created_at, t.updated_at,
            r.revised_at AS owner_updated_at
       FROM templates AS t
       JOIN users AS u ON u.id = t.user_id
       LEFT JOIN sitemap_owner_revisions AS r ON r.user_id = u.id
      WHERE ${PUBLIC_TEMPLATE_SQL_WHERE}
        AND t.category IS NOT NULL AND TRIM(t.category) <> ''`,
  ).all<{
    category: string | null;
    created_at: string;
    updated_at: string | null;
    owner_updated_at: string | null;
  }>();
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
  result.results.forEach((row) => {
    const lastmod = mostRecentLastmod(
      row.updated_at || row.created_at,
      row.owner_updated_at,
    );
    parseCategories(row.category).forEach((category) => addCategory(category, lastmod));
  });
  const categoryRevisions = await env.DB.prepare(
    `SELECT category, revised_at FROM sitemap_category_revisions`,
  ).all<{ category: string; revised_at: string }>();
  categoryRevisions.results.forEach((row) => {
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
  env: Env;
  params: Record<string, string | string[]>;
  sql: string;
  toEntry: (row: Row) => SitemapEntry | null;
  prefixEntries?: SitemapEntry[];
};

export async function handlePagedDatabaseSitemap<Row>({
  request,
  env,
  params,
  sql,
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
  const result = databaseLimit > 0
    ? await env.DB.prepare(sql).bind(databaseLimit, databaseOffset).all<Row>()
    : { results: [] as Row[] };
  const databaseEntries = result.results
    .map(toEntry)
    .filter((entry): entry is SitemapEntry => entry !== null);
  const entries = [...prefixedPageEntries, ...databaseEntries];

  return entries.length === 0
    ? xmlResponse(request, renderUrlset([]), 404)
    : xmlResponse(request, renderUrlset(entries));
}
