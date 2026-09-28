import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string[];
  image?: string;
  url?: string;
  type?: 'website' | 'article';
  publishedTime?: string;
  author?: string;
  robots?: string;
}

export const SEOHead: React.FC<SEOHeadProps> = ({
  title = 'Checklist App - Create and Manage Your Workflows',
  description = 'Create, share, and run interactive checklists for your workflows. Organize tasks, track progress, and boost productivity.',
  keywords = ['checklist', 'workflow', 'productivity', 'task management', 'templates'],
  image = '/placeholder.svg',
  // Without an explicit url, use the page address minus query and hash, so tracking
  // parameters never become part of the canonical URL or og:url.
  url = `${window.location.origin}${window.location.pathname}`,
  type = 'website',
  publishedTime,
  author,
  robots = 'index, follow',
}) => {
  const fullTitle = title.includes('Checklist App') ? title : `${title} | Checklist App`;
  const fullImageUrl = image.startsWith('http') ? image : `${window.location.origin}${image}`;

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
