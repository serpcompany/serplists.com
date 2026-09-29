import { servePagesSitemap, shardPageParam } from '@functions/sitemap/routes';

type Context = { params: Promise<{ page: string }> };

// /sitemaps/pages/<page>.xml: the static pages, from the bundled catalog.
export async function GET(request: Request, { params }: Context) {
  return servePagesSitemap(request, shardPageParam((await params).page));
}
