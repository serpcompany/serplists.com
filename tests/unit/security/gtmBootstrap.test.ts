import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

import { isSensitiveAnalyticsLocation, isTagManagerLoaded } from '@/lib/analyticsUrl';

import {
  SAFE_ANALYTICS_LOCATIONS,
  SENSITIVE_ANALYTICS_LOCATIONS,
} from '../../fixtures/analyticsLocations';

// Tags in the Google Tag Manager container read location.href at load (GA4 sends it as
// page_location), so a document whose URL carries a share or invite token, a password
// reset token or an email address must never load the container.

const indexHtml = readFileSync('index.html', 'utf8');

function extractTagManagerBootstrap(html: string): string {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const bootstrap = scripts.filter((script) => script.includes('googletagmanager.com/gtm.js'));
  expect(bootstrap).toHaveLength(1);
  return bootstrap[0];
}

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

  vm.runInNewContext(extractTagManagerBootstrap(indexHtml), {
    window,
    document,
    URLSearchParams,
    decodeURIComponent,
  });

  return { insertedSources, dataLayer: window.dataLayer as unknown[] | undefined };
}

describe('index.html Google Tag Manager bootstrap', () => {
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
    const script = extractTagManagerBootstrap(indexHtml);
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
