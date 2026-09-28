import React from 'react';
import { Helmet } from 'react-helmet-async';

import { APP_BRAND_NAME, buildPageTitle } from '@/lib/brand';
import { SITE_SOCIAL_IMAGE } from '@/lib/publicPageMeta';
import { buildSiteUrl } from '@/lib/routes';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string[];
  url?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  author?: string;
  robots?: string;
}

// Link previews need an absolute PNG on the production site, also on staging and preview hosts.
const SOCIAL_IMAGE_URL = buildSiteUrl(SITE_SOCIAL_IMAGE.path);

export const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description = 'Create, share, and run interactive checklists for your workflows. Organize tasks, track progress, and boost productivity.',
  keywords = ['checklist', 'workflow', 'productivity', 'task management', 'templates'],
  // Without an explicit url, use the page address minus query and hash, so tracking
  // parameters never become part of the canonical URL or og:url.
  url = `${window.location.origin}${window.location.pathname}`,
  type = 'website',
  publishedTime,
  author,
  robots = 'index, follow',
}) => {
  const fullTitle = buildPageTitle(title);

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords.join(', ')} />
      
      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={SOCIAL_IMAGE_URL} />
      <meta property="og:image:width" content={String(SITE_SOCIAL_IMAGE.width)} />
      <meta property="og:image:height" content={String(SITE_SOCIAL_IMAGE.height)} />
      <meta property="og:image:alt" content={SITE_SOCIAL_IMAGE.alt} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={APP_BRAND_NAME} />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SOCIAL_IMAGE_URL} />
      
      {/* Additional Meta Tags. The viewport lives in index.html only. */}
      <meta name="robots" content={robots} />
      <link rel="canonical" href={url} />
      
      {/* Article specific meta tags */}
      {type === 'article' && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}
      {author && (
        <meta property="article:author" content={author} />
      )}
      
      {/* Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": type === 'article' ? 'Article' : 'WebSite',
          "name": fullTitle,
          "description": description,
          "url": url,
          "image": SOCIAL_IMAGE_URL,
          ...(type === 'article' && {
            "publisher": { "@type": "Organization", "name": APP_BRAND_NAME },
            ...(publishedTime && { "datePublished": publishedTime }),
            ...(author && { "author": { "@type": "Person", "name": author } }),
          })
        })}
      </script>
    </Helmet>
  );
};
