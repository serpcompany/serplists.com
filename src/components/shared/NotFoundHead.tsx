import { Helmet } from 'react-helmet-async';

import { buildPageTitle } from '@/lib/brand';

/**
 * Head for a page that settled as missing. Pages serves index.html with a 200 for every
 * path, so this robots tag is what keeps a missing URL out of search results. No canonical,
 * og:url or JSON-LD: the address is not a page. Render it only once a lookup has settled as
 * not found (a 404), never while loading or after a failure that may be transient, and never
 * next to an SEOHead.
 */
export const NotFoundHead = ({ title }: { title: string }) => (
  <Helmet>
    <title>{buildPageTitle(title)}</title>
    <meta name="robots" content="noindex, follow" />
  </Helmet>
);
