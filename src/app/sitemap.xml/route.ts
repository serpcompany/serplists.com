import { serveSitemapIndex } from '@functions/sitemap/routes';
import { getSitemapContext } from '@/server/sitemapContext';

export async function GET(request: Request) {
  return serveSitemapIndex(await getSitemapContext(request));
}
