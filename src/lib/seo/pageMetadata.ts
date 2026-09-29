import type { Metadata } from 'next';

import { APP_BRAND_NAME, buildPageTitle } from '@/lib/brand';
import { SITE_SOCIAL_IMAGE } from '@/lib/publicPageMeta';
import { buildCanonicalUrl, CANONICAL_ORIGIN } from '@/lib/seo/siteOrigin';

/** What a page says about itself in its <head>, its link preview and its JSON-LD. */
export interface PageSeo {
  /** The page's own title; the brand suffix is added once ("Page | SERP Lists"). */
  title: string;
  description?: string;
  keywords?: readonly string[];
  /** The page's path. Its canonical URL and og:url are that path on the production site. */
  path?: string;
  type?: 'website' | 'article';
  /** ISO date, for an article. */
  publishedTime?: string;
  /** 'index, follow' unless the page says otherwise. */
  robots?: string;
}

// The defaults a page's tags had when it named only a title.
const DEFAULT_DESCRIPTION =
  'Create, share, and run interactive checklists for your workflows. Organize tasks, track progress, and boost productivity.';
const DEFAULT_KEYWORDS = ['checklist', 'workflow', 'productivity', 'task management', 'templates'];

// Link previews need an absolute PNG on the production site, also on staging and preview hosts.
const SOCIAL_IMAGE_URL = new URL(SITE_SOCIAL_IMAGE.path, CANONICAL_ORIGIN).toString();

/**
 * The Metadata a page exports (or returns from generateMetadata). Only
 * https://serplists.com may be indexed: every other host also gets
 * `X-Robots-Tag: noindex, nofollow` from next.config.ts, which wins over this tag.
 */
export function buildPageMetadata(seo: PageSeo): Metadata {
  const title = buildPageTitle(seo.title);
  const description = seo.description ?? DEFAULT_DESCRIPTION;
  const url = seo.path ? buildCanonicalUrl(seo.path) : undefined;
  const type = seo.type ?? 'website';

  return {
    // Absolute: buildPageTitle already added the brand, and never twice.
    title: { absolute: title },
    description,
    keywords: [...(seo.keywords ?? DEFAULT_KEYWORDS)],
    robots: seo.robots ?? 'index, follow',
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      title,
      description,
      url,
      siteName: APP_BRAND_NAME,
      images: [
        {
          url: SOCIAL_IMAGE_URL,
          width: SITE_SOCIAL_IMAGE.width,
          height: SITE_SOCIAL_IMAGE.height,
          alt: SITE_SOCIAL_IMAGE.alt,
        },
      ],
      ...(type === 'article'
        ? { type: 'article', ...(seo.publishedTime ? { publishedTime: seo.publishedTime } : {}) }
        : { type: 'website' }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [SOCIAL_IMAGE_URL],
    },
  };
}

/** The page's schema.org description, rendered with <JsonLd>. */
export function buildPageJsonLd(seo: PageSeo): Record<string, unknown> {
  const title = buildPageTitle(seo.title);
  const isArticle = seo.type === 'article';
  return {
    '@context': 'https://schema.org',
    '@type': isArticle ? 'Article' : 'WebSite',
    name: title,
    description: seo.description ?? DEFAULT_DESCRIPTION,
    ...(seo.path ? { url: buildCanonicalUrl(seo.path) } : {}),
    image: SOCIAL_IMAGE_URL,
    ...(isArticle
      ? {
          publisher: { '@type': 'Organization', name: APP_BRAND_NAME },
          ...(seo.publishedTime ? { datePublished: seo.publishedTime } : {}),
        }
      : {}),
  };
}
