import type { MetadataRoute } from 'next';

import { buildCanonicalUrl, isProductionSite } from '@/lib/seo/siteOrigin';

// /robots.txt. Next.js renders it at build time, so the build's SITE_ENV decides, as it does for
// the X-Robots-Tag header in next.config.ts. Production may be crawled and lists its sitemap;
// every other build (staging, a local one) asks crawlers to stay out.
export default function robots(): MetadataRoute.Robots {
  if (!isProductionSite()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: [
      ...['Googlebot', 'Bingbot', 'Twitterbot', 'facebookexternalhit'].map((userAgent) => ({
        userAgent,
        allow: '/',
      })),
      { userAgent: '*', allow: '/' },
    ],
    sitemap: buildCanonicalUrl('/sitemap.xml'),
  };
}
