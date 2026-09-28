import type { ReactNode } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';

import { APP_BRAND_NAME, SITE_DEFAULT_DESCRIPTION } from '@/lib/brand';
import { buildSiteUrl } from '@/lib/routes';

interface DocumentHeadProviderProps {
  children: ReactNode;
  /** Server-render context, for tests. */
  context?: Record<string, unknown>;
}

const SITE_DEFAULT_IMAGE = buildSiteUrl('/placeholder.svg');

/**
 * HelmetProvider plus the site-wide head defaults. react-helmet-async leaves document.title
 * unchanged when the last page title unmounts, so without this default a page that sets no
 * title (Pricing, the dashboard) would keep the title of the page before it. Page titles
 * from SEOHead mount later and win.
 *
 * The meta tags repeat the static ones in index.html, which carry data-rh so Helmet owns
 * them: a page's SEOHead replaces each one by name or property instead of adding a second
 * copy, and leaving that page puts these values back. They must stay identical to
 * index.html (tests/unit/components/documentHeadMeta.test.tsx).
 */
export function DocumentHeadProvider({ children, context }: DocumentHeadProviderProps) {
  return (
    <HelmetProvider context={context}>
      <Helmet defaultTitle={APP_BRAND_NAME}>
        <meta name="description" content={SITE_DEFAULT_DESCRIPTION} />
        <meta property="og:title" content={APP_BRAND_NAME} />
        <meta property="og:description" content={SITE_DEFAULT_DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={SITE_DEFAULT_IMAGE} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={SITE_DEFAULT_IMAGE} />
      </Helmet>
      {children}
    </HelmetProvider>
  );
}
