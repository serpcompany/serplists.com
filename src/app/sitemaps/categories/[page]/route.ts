import { serveCategoriesSitemap, shardPageParam } from '@functions/sitemap/routes';
import { getSitemapContext } from '@/server/sitemapContext';

type Context = { params: Promise<{ page: string }> };

// /sitemaps/categories/<page>.xml, cached like every database shard (functions/sitemap/cache.ts).
export async function GET(request: Request, { params }: Context) {
  return serveCategoriesSitemap(await getSitemapContext(request), shardPageParam((await params).page));
}
