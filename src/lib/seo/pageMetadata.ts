import type { Metadata } from 'next';

import { APP_BRAND_NAME, buildPageTitle } from '@/lib/brand';
import { SITE_SOCIAL_IMAGE } from '@/lib/publicPageMeta';
import { buildCanonicalUrl, CANONICAL_ORIGIN } from '@/lib/seo/siteOrigin';

export interface PageSeo {
  title: string;
  description?: string;
  keywords?: readonly string[];
  path?: string | undefined;
  type?: 'website' | 'article';
  publishedTime?: string | undefined;
  robots?: string;
}

const DEFAULT_DESCRIPTION =
  'Create, share, and run interactive checklists for your workflows. Organize tasks, track progress, and boost productivity.';
const DEFAULT_KEYWORDS = ['checklist', 'workflow', 'productivity', 'task management', 'templates'];

const SOCIAL_IMAGE_URL = new URL(SITE_SOCIAL_IMAGE.path, CANONICAL_ORIGIN).toString();

export function buildPageMetadata(seo: PageSeo): Metadata {
  const title = buildPageTitle(seo.title);
  const description = seo.description ?? DEFAULT_DESCRIPTION;
  const url = seo.path ? buildCanonicalUrl(seo.path) : undefined;
  const type = seo.type ?? 'website';

  return {
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

export async function metadataForSeo(seo: Promise<PageSeo | null>, withoutSeo: Metadata = {}): Promise<Metadata> {
  const resolved = await seo;
  return resolved ? buildPageMetadata(resolved) : withoutSeo;
}
