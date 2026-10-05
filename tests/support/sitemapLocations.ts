import type { SitemapContext } from '../../functions/sitemap/cache';
import { apiEnv } from './apiEnv';
import type { SqliteD1 } from './sqlite-d1';

type ServeShard = (context: SitemapContext, page: string) => Promise<Response>;

export async function sitemapEntries(d1: SqliteD1, serve: ServeShard, path: string): Promise<Array<{ loc: string; lastmod: string | null }>> {
  const response = await serve(
    { request: new Request(`https://serplists.com${path}`), env: apiEnv({ DB: d1.binding }), waitUntil: () => undefined },
    '1',
  );
  const xml = await response.text();
  return Array.from(xml.matchAll(/<loc>https:\/\/serplists\.com([^<]*)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?/g), (match) => ({
    loc: match[1] ?? '',
    lastmod: match[2] ?? null,
  }));
}

export async function sitemapLocations(d1: SqliteD1, serve: ServeShard, path: string): Promise<string[]> {
  return (await sitemapEntries(d1, serve, path)).map(({ loc }) => loc);
}
