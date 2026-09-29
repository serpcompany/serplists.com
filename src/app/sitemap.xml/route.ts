import { serveSitemapIndex } from '@functions/sitemap/routes';
import { getSitemapContext } from '@/server/sitemapContext';

// The sitemap index, built from D1 and cached in the data center until the sitemap
// revisions change (functions/sitemap/cache.ts). HEAD is answered by GET, without a body.
export async function GET(request: Request) {
  return serveSitemapIndex(await getSitemapContext(request));
}
