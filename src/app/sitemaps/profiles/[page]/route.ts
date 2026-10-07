import { serveProfilesSitemap, shardPageParam } from '@functions/sitemap/routes';
import { getSitemapContext } from '@/server/sitemapContext';

type Context = { params: Promise<{ page: string }> };

export async function GET(request: Request, { params }: Context) {
  return serveProfilesSitemap(await getSitemapContext(request), shardPageParam((await params).page));
}
