/**
 * For a page that learns in the browser that it has nothing to index: a category with no
 * public templates, or a template, profile or category that turned out not to exist after
 * the server had rendered it. React hoists the tag into <head> next to the page's server
 * metadata, and search engines follow the more restrictive robots rule. Render it only
 * once the lookup has settled (a real answer), never while loading or after a failure that
 * may be transient.
 */
export function NoIndexMeta({ follow }: { follow: boolean }) {
  return <meta name="robots" content={follow ? 'noindex, follow' : 'noindex, nofollow'} />;
}
