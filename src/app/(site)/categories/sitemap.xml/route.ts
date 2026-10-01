import { redirectLegacySitemap } from '@functions/sitemap/routes';

export function GET(request: Request) {
  return redirectLegacySitemap(request, 'categories');
}
