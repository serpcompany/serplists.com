import { serveTemplatesSitemap, shardPageParam } from '@functions/sitemap/routes';
import { getSitemapContext } from '@/server/sitemapContext';

type Context = { params: Promise<{ page: string }> };

// /sitemaps/templates/<page>.xml, cached like every database shard (functions/sitemap/cache.ts).
export async function GET(request: Request, { params }: Context) {
  return serveTemplatesSitemap(await getSitemapContext(request), shardPageParam((await params).page));
}
