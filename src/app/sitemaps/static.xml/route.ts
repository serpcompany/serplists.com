import { redirectLegacySitemap } from '@functions/sitemap/routes';

// The static pages' sitemap before it moved to /sitemaps/pages/<page>.xml.
export function GET(request: Request) {
  return redirectLegacySitemap(request, 'pages');
}
