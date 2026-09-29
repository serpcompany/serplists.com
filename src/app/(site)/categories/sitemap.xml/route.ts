import { redirectLegacySitemap } from '@functions/sitemap/routes';

// The category sitemap before it moved into the sitemap index's shards
// (/sitemaps/categories/<page>.xml).
export function GET(request: Request) {
  return redirectLegacySitemap(request, 'categories');
}
