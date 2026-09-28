import type { ReactNode } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';

import { APP_BRAND_NAME } from '@/lib/brand';

interface DocumentHeadProviderProps {
  children: ReactNode;
  /** Server-render context, for tests. */
  context?: Record<string, unknown>;
}

/**
 * HelmetProvider plus the site-wide default title. react-helmet-async leaves document.title
 * unchanged when the last page title unmounts, so without this default a page that sets no
 * title (Pricing, the dashboard) would keep the title of the page before it. Page titles
 * from SEOHead mount later and win.
 */
export function DocumentHeadProvider({ children, context }: DocumentHeadProviderProps) {
  return (
    <HelmetProvider context={context}>
      <Helmet defaultTitle={APP_BRAND_NAME} />
      {children}
    </HelmetProvider>
  );
}
