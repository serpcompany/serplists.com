import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

import '@/index.css';
import { TAG_MANAGER_BOOTSTRAP_SCRIPT, TAG_MANAGER_ID } from '@/lib/analytics/tagManagerBootstrap';
import { APP_BRAND_NAME, SITE_DEFAULT_DESCRIPTION } from '@/lib/brand';
import { SITE_SOCIAL_IMAGE } from '@/lib/publicPageMeta';
import { THEME_BOOT_SCRIPT } from '@/lib/themeBootScript';

import { Providers } from './providers';

// The defaults every page starts from. A page's own metadata replaces them by name, so each
// public page gets its own title, description and link preview in the HTML the server sends.
export const metadata: Metadata = {
  metadataBase: new URL('https://serplists.com'),
  title: { default: APP_BRAND_NAME, template: `%s | ${APP_BRAND_NAME}` },
  description: SITE_DEFAULT_DESCRIPTION,
  openGraph: {
    siteName: APP_BRAND_NAME,
    title: APP_BRAND_NAME,
    description: SITE_DEFAULT_DESCRIPTION,
    type: 'website',
    images: [{ ...SITE_SOCIAL_IMAGE, url: SITE_SOCIAL_IMAGE.path }],
  },
  twitter: { card: 'summary_large_image', images: [SITE_SOCIAL_IMAGE.path] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script sets the html class before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* Both run before the page hydrates: the theme before the first paint, and Tag Manager
            only on pages whose URL carries nothing sensitive. */}
        <Script id="theme-boot" strategy="beforeInteractive">
          {THEME_BOOT_SCRIPT}
        </Script>
        <Script id="tag-manager" strategy="beforeInteractive">
          {TAG_MANAGER_BOOTSTRAP_SCRIPT}
        </Script>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${TAG_MANAGER_ID}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
