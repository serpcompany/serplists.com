import { servePagesSitemap, shardPageParam } from '@functions/sitemap/routes';

type Context = { params: Promise<{ page: string }> };

export async function GET(request: Request, { params }: Context) {
  return servePagesSitemap(request, shardPageParam((await params).page));
}
