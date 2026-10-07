import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';

import './globals.css';
import { TAG_MANAGER_BOOTSTRAP_SCRIPT, TAG_MANAGER_ID } from '@/lib/analytics/tagManagerBootstrap';
import { APP_BRAND_NAME, SITE_DEFAULT_DESCRIPTION } from '@/lib/brand';
import { SITE_SOCIAL_IMAGE } from '@/lib/publicPageMeta';
import { isProductionSite } from '@/lib/seo/siteOrigin';
import { THEME_BOOT_SCRIPT } from '@/lib/themeBootScript';

import { Providers } from './providers';

const geistSans = Geist({ variable: '--font-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

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
  const loadAnalytics = isProductionSite();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {loadAnalytics ? <script dangerouslySetInnerHTML={{ __html: TAG_MANAGER_BOOTSTRAP_SCRIPT }} /> : null}
      </head>
      <body className="min-h-full">
        {loadAnalytics ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${TAG_MANAGER_ID}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
