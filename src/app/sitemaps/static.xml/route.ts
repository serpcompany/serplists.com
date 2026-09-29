import { redirectLegacyStaticSitemap } from '@functions/sitemap/routes';

// The static pages' sitemap before it moved to /sitemaps/pages/<page>.xml.
export function GET(request: Request) {
  return redirectLegacyStaticSitemap(request);
}
