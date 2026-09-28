import React from 'react';
import { Helmet } from 'react-helmet-async';

import { buildCanonicalUrl, CANONICAL_ORIGIN, isIndexableHost } from '@/lib/seo/siteOrigin';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  /** Canonical URL. Defaults to the production URL of the current path. */
  url?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  author?: string;
  /** Defaults to 'index, follow' on serplists.com and 'noindex, nofollow' on any other host. */
  robots?: string;
}

const getCurrentPageUrl = (): URL | null => {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href);
  } catch {
    return null;
  }
};

export const SEOHead: React.FC<SEOHeadProps> = ({
  title = 'Checklist App - Create and Manage Your Workflows',
  description = 'Create, share, and run interactive checklists for your workflows. Organize tasks, track progress, and boost productivity.',
  keywords = ['checklist', 'workflow', 'productivity', 'task management', 'templates'],
  image = '/placeholder.svg',
  url: urlProp,
  type = 'website',
  publishedTime,
  author,
  robots: robotsProp,
}) => {
  // Staging and the *.pages.dev aliases serve this same app: point every copy at
  // production and keep the non-production hosts out of the index.
  const currentPage = getCurrentPageUrl();
  const url = urlProp ?? buildCanonicalUrl(currentPage?.pathname ?? '/');
  const robots =
    robotsProp ?? (isIndexableHost(currentPage?.hostname) ? 'index, follow' : 'noindex, nofollow');
  const fullTitle = title.includes('Checklist App') ? title : `${title} | Checklist App`;
  const fullImageUrl = image.startsWith('http') ? image : new URL(image, CANONICAL_ORIGIN).toString();

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords.join(', ')} />
      
      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImageUrl} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Checklist App" />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImageUrl} />
      
      {/* Additional Meta Tags */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
          "image": fullImageUrl,
          ...(type === 'article' && publishedTime && {
            "datePublished": publishedTime,
            "author": {
              "@type": "Person",
              "name": author || "Checklist App"
            }
          })
        })}
      </script>
    </Helmet>
  );
};
