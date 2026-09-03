import type { Env } from '../api/types';
import bundledTemplateCatalog from './bundled-catalog.generated.json';

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

const bundledTemplates = (bundledTemplateCatalog.templates as BundledTemplate[]).filter(
  (template) => template.slug?.trim(),
);

const staticPages = bundledTemplateCatalog.staticPages as StaticPage[];

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
  const timestamp = Date.parse(value);
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
  return [
    ...staticPages.map((entry) => (
      entry.path === '/templates' || entry.path === '/categories'
        ? { path: entry.path }
        : entry
    )),
    ...bundledTemplateEntries(),
  ];
}

export function isValidUsername(value: string): boolean {
  return value.length >= 3 && value.length <= 30 && /^[A-Za-z0-9_.]+$/.test(value);
}

export function isValidTemplateSlug(value: string): boolean {
  return value.length >= 1 && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function buildInMemoryShardIndex(
  kind: 'static' | 'categories',
  entries: SitemapEntry[],
): SitemapEntry[] {
  const pages = Math.ceil(entries.length / SITEMAP_PAGE_SIZE);
  return Array.from({ length: pages }, (_, index) => {
    const page = index + 1;
    return {
      path: `/sitemaps/${kind}/${page}.xml`,
    };
  });
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

export async function loadCategoryEntries(env: Env): Promise<SitemapEntry[]> {
  const result = await env.DB.prepare(
    `SELECT t.category
       FROM templates AS t
      WHERE ${PUBLIC_TEMPLATE_SQL_WHERE}
        AND t.category IS NOT NULL AND TRIM(t.category) <> ''`,
  ).all<{ category: string | null }>();
  const slugs = new Set<string>();
  const addCategory = (category: string) => {
    const slug = categorySlug(category);
    if (slug) slugs.add(slug);
  };

  bundledTemplates.forEach((template) => {
    template.categories?.forEach(addCategory);
  });
  result.results.forEach((row) => {
    parseCategories(row.category).forEach(addCategory);
  });

  return Array.from(slugs, (slug) => ({
    path: `/categories/${encodeURIComponent(slug)}`,
  })).sort((left, right) => left.path.localeCompare(right.path));
}

type PagedSitemapOptions<Row> = {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  sql: string;
  toEntry: (row: Row) => SitemapEntry | null;
};

export async function handlePagedDatabaseSitemap<Row>({
  request,
  env,
  params,
  sql,
  toEntry,
}: PagedSitemapOptions<Row>): Promise<Response> {
  if (!requestSupportsSitemap(request.method)) return methodNotAllowed();
  const page = parsePage(params.page);
  if (!page) return xmlResponse(request, renderUrlset([]), 404);

  const result = await env.DB.prepare(sql)
    .bind(SITEMAP_PAGE_SIZE, (page - 1) * SITEMAP_PAGE_SIZE)
    .all<Row>();
  const entries = result.results
    .map(toEntry)
    .filter((entry): entry is SitemapEntry => entry !== null);

  return entries.length === 0
    ? xmlResponse(request, renderUrlset([]), 404)
    : xmlResponse(request, renderUrlset(entries));
}
