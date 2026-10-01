import type { MetadataRoute } from 'next';

import { buildCanonicalUrl, isProductionSite } from '@/lib/seo/siteOrigin';

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
