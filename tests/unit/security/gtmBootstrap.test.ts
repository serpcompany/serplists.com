import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import RootLayout from '@/app/layout';
import { TAG_MANAGER_BOOTSTRAP_SCRIPT, TAG_MANAGER_ID } from '@/lib/analytics/tagManagerBootstrap';
import { isSensitiveAnalyticsLocation, isTagManagerLoaded } from '@/lib/analyticsUrl';

import { withSiteEnv } from '../../support/siteEnv';

import {
  SAFE_ANALYTICS_LOCATIONS,
  SENSITIVE_ANALYTICS_LOCATIONS,
} from '../../fixtures/analyticsLocations';

// Tags in the Google Tag Manager container read location.href at load (GA4 sends it as
// page_location), so a document whose URL carries a share or invite token, a password
// reset token or an email address must never load the container. The root layout renders
// the bootstrap into every page's <head>, where it runs while the page is parsed.

const layout = readFileSync('src/app/layout.tsx', 'utf8');

interface BootstrapResult {
  insertedSources: string[];
  dataLayer: unknown[] | undefined;
}

function runBootstrap(pathname: string, search: string): BootstrapResult {
  const insertedSources: string[] = [];
  const firstScript = {
    parentNode: {
      insertBefore(element: { src?: string }) {
        insertedSources.push(element.src ?? '');
      },
    },
  };
  const window: Record<string, unknown> = {
    location: { pathname, search, href: `https://serplists.com${pathname}${search}` },
  };
  const document = {
    getElementsByTagName: () => [firstScript],
    createElement: () => ({}),
  };

  vm.runInNewContext(TAG_MANAGER_BOOTSTRAP_SCRIPT, {
    window,
    document,
    URLSearchParams,
    decodeURIComponent,
  });

  return { insertedSources, dataLayer: window.dataLayer as unknown[] | undefined };
}

vi.mock('next/navigation', async () => (await import('../../support/nextNavigation')).nextNavigationMock);
vi.mock('next/link', async () => (await import('../../support/nextNavigation')).nextLinkMock);

// What the root layout puts on a page for Tag Manager: the bootstrap script and the noscript
// frame, read from its element tree (the page itself is not rendered).
const tagManagerOnPage = (siteEnv: string | undefined) =>
  withSiteEnv(siteEnv, () => {
    const found = { bootstrap: false, noscript: false };
    const visit = (node: ReactNode): void => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!isValidElement<{ children?: ReactNode; dangerouslySetInnerHTML?: { __html: string }; src?: string }>(node)) return;
      if (node.props.dangerouslySetInnerHTML?.__html === TAG_MANAGER_BOOTSTRAP_SCRIPT) found.bootstrap = true;
      if (typeof node.props.src === 'string' && node.props.src.includes(`ns.html?id=${TAG_MANAGER_ID}`)) found.noscript = true;
      visit(node.props.children);
    };
    visit(RootLayout({ children: null }));
    return found;
  });

describe('Google Tag Manager on each environment', () => {
  // SERP environment configuration standard: analytics run only where SITE_ENV=production,
  // never on staging or a local build, whatever host serves it.
  it('loads the container only on the production site', async () => {
    expect(await tagManagerOnPage('production')).toEqual({ bootstrap: true, noscript: true });
    for (const siteEnv of ['staging', undefined, 'prod']) {
      expect(await tagManagerOnPage(siteEnv), String(siteEnv)).toEqual({ bootstrap: false, noscript: false });
    }
  });
});

describe('Google Tag Manager bootstrap', () => {
  // A plain script in <head> runs while the page is parsed, as Tag Manager's own snippet
  // does; next/script's beforeInteractive would wait for Next.js's runtime to load.
  it('runs from the root layout head on every page, while the page is parsed', () => {
    const head = /<head>([\s\S]*?)<\/head>/.exec(layout)?.[1] ?? '';

    expect(head).toMatch(/<script dangerouslySetInnerHTML=\{\{ __html: TAG_MANAGER_BOOTSTRAP_SCRIPT \}\} \/>/);
    // The script and the noscript fallback name the same container.
    expect(layout).toContain('https://www.googletagmanager.com/ns.html?id=${TAG_MANAGER_ID}');
    expect(TAG_MANAGER_BOOTSTRAP_SCRIPT).toContain(`'${TAG_MANAGER_ID}'`);
  });

  it.each(SENSITIVE_ANALYTICS_LOCATIONS)('does not load the container on %s%s', (pathname, search) => {
    const result = runBootstrap(pathname, search);

    expect(result.insertedSources).toEqual([]);
    expect(result.dataLayer ?? []).toEqual([]);
    expect(isTagManagerLoaded({ dataLayer: result.dataLayer })).toBe(false);
  });

  it.each(SAFE_ANALYTICS_LOCATIONS)('loads the container on %s%s', (pathname, search) => {
    const result = runBootstrap(pathname, search);

    expect(result.insertedSources).toEqual([
      'https://www.googletagmanager.com/gtm.js?id=GTM-PZZFQBGG',
    ]);
    expect(result.dataLayer).toEqual([expect.objectContaining({ event: 'gtm.js' })]);
    expect(isTagManagerLoaded({ dataLayer: result.dataLayer })).toBe(true);
  });

  it('applies the same rule as src/lib/analyticsUrl.ts', () => {
    for (const [pathname, search] of [...SENSITIVE_ANALYTICS_LOCATIONS, ...SAFE_ANALYTICS_LOCATIONS]) {
      const loaded = runBootstrap(pathname, search).insertedSources.length > 0;
      expect({ pathname, search, loaded }).toEqual({
        pathname,
        search,
        loaded: !isSensitiveAnalyticsLocation(pathname, search),
      });
    }
  });

  it('fails closed when the location cannot be read', () => {
    const script = TAG_MANAGER_BOOTSTRAP_SCRIPT;
    const insertedSources: string[] = [];
    const window = {};
    Object.defineProperty(window, 'location', {
      get() {
        throw new Error('blocked');
      },
    });

    vm.runInNewContext(script, {
      window,
      document: {
        getElementsByTagName: () => [
          { parentNode: { insertBefore: (el: { src?: string }) => insertedSources.push(el.src ?? '') } },
        ],
        createElement: () => ({}),
      },
      URLSearchParams,
      decodeURIComponent,
    });

    expect(insertedSources).toEqual([]);
  });
});
