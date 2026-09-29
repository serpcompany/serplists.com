import { describe, expect, it } from 'vitest';

import robots from '@/app/robots';
import { renderStaticHeaders } from '@/lib/http/securityHeaders';
import {
  buildCanonicalUrl,
  CANONICAL_ORIGIN,
  deploymentOrigin,
  isProductionSite,
  STAGING_ORIGIN,
} from '@/lib/seo/siteOrigin';

import { headersFor, loadBuiltRoutes, withSiteEnv } from '../../support/nextRouting';

// SERP environment configuration standard: a site is non-production (noindex, analytics off)
// unless it is explicitly marked production, by SITE_ENV=production in the production build and
// the production Worker's vars. Nothing is inferred from the host. The Worker's pages and API
// responses get their headers from next.config.ts at build time; the static files Workers
// Static Assets serves without running the Worker get theirs from public/_headers, which the
// build writes (scripts/generate-static-headers.ts); robots.txt is rendered at build time too.

const PRODUCTION = await loadBuiltRoutes('production');
const STAGING = await loadBuiltRoutes('staging');
const LOCAL = await loadBuiltRoutes(undefined);

const robotsHeader = (headers: Map<string, string[]>) => (headers.get('x-robots-tag') ?? []).join(', ');

// Any host: the environment decides, not the host a request names.
const URLS = [
  'https://serplists.com/',
  'https://serplists.com/templates/',
  'https://serplists.com/profile/serp/ultimate-camping-checklist/',
  'https://serplists.com/api/templates',
  'https://staging.serplists.com/templates/',
  'https://serp-checklists-preview.serp.workers.dev/',
  'http://localhost:3000/profile/serp/ultimate-camping-checklist/',
  'http://127.0.0.1:4173/templates/',
];

describe('indexing headers on pages and API responses (next.config.ts)', () => {
  it.each(URLS)('keeps %s indexable in a production build', (url) => {
    expect(robotsHeader(headersFor(PRODUCTION.headers, url))).not.toContain('noindex');
  });

  it.each(URLS)('marks %s noindex in a staging build and in a build without SITE_ENV', (url) => {
    expect(robotsHeader(headersFor(STAGING.headers, url))).toContain('noindex');
    expect(robotsHeader(headersFor(LOCAL.headers, url))).toContain('noindex');
  });

  it('keeps share pages out of the index in every build', () => {
    for (const build of [PRODUCTION, STAGING, LOCAL]) {
      expect(robotsHeader(headersFor(build.headers, 'https://serplists.com/share/abc/'))).toContain('noindex');
    }
  });

  it('sends the security headers once on every host', () => {
    for (const url of [
      'https://serplists.com/templates/',
      'https://staging.serplists.com/api/health',
      'http://localhost:3000/dashboard/',
      'http://127.0.0.1:4173/',
    ]) {
      const headers = headersFor(PRODUCTION.headers, url);
      expect(headers.get('content-security-policy')?.length, url).toBe(1);
      expect(headers.get('strict-transport-security')?.length, url).toBe(1);
    }
  });

  // On http://localhost the browser applied upgrade-insecure-requests to the redirects the
  // app's navigations follow (/dashboard/ to /dashboard/templates/), asked for https, and the
  // navigation stalled until Next.js gave up and reloaded the page.
  it('upgrades insecure requests on the deployed hosts only', () => {
    const policyFor = (url: string) => headersFor(PRODUCTION.headers, url).get('content-security-policy')?.[0];
    for (const url of ['https://serplists.com/', 'https://staging.serplists.com/dashboard/', 'https://serp-checklists-preview.serp.workers.dev/']) {
      expect(policyFor(url), url).toContain('upgrade-insecure-requests');
    }
    for (const url of ['http://localhost:3000/dashboard/', 'http://127.0.0.1:4173/']) {
      expect(policyFor(url), url).not.toContain('upgrade-insecure-requests');
      expect(policyFor(url), url).toBe(policyFor('https://serplists.com/')?.replace(/; upgrade-insecure-requests$/, ''));
    }
  });
});

type StaticRule = { pattern: string; headers: Array<[string, string]> };

const parseHeadersFile = (source: string): StaticRule[] => {
  const rules: StaticRule[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (/^\s/.test(line)) {
      const separator = line.indexOf(':');
      rules.at(-1)?.headers.push([
        line.slice(0, separator).trim().toLowerCase(),
        line.slice(separator + 1).trim(),
      ]);
    } else {
      rules.push({ pattern: line.trim(), headers: [] });
    }
  }
  return rules;
};

// Cloudflare's _headers matching for a path pattern: `*` matches greedily.
const staticHeadersFor = (production: boolean, url: string): Map<string, string[]> => {
  const { pathname } = new URL(url);
  const applied = new Map<string, string[]>();
  for (const rule of parseHeadersFile(renderStaticHeaders({ production }))) {
    const matcher = new RegExp(`^${rule.pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    if (!matcher.test(pathname)) continue;
    for (const [name, value] of rule.headers) applied.set(name, [...(applied.get(name) ?? []), value]);
  }
  return applied;
};

describe('indexing headers on static files (public/_headers)', () => {
  const FILES = ['https://serplists.com/og-default.png', 'https://serplists.com/_next/static/chunks/app.js', 'https://serplists.com/fonts/geist.woff2'];

  it.each(FILES)('keeps %s indexable in a production build', (url) => {
    expect(robotsHeader(staticHeadersFor(true, url))).not.toContain('noindex');
  });

  it.each(FILES)('marks %s noindex in any other build', (url) => {
    expect(robotsHeader(staticHeadersFor(false, url))).toContain('noindex');
  });

  it('sends the same security headers as the Worker', () => {
    for (const production of [true, false]) {
      const staticHeaders = staticHeadersFor(production, 'https://serplists.com/og-default.png');
      const workerHeaders = headersFor(PRODUCTION.headers, 'https://serplists.com/templates/');
      for (const name of ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'permissions-policy']) {
        expect(staticHeaders.get(name), name).toEqual(workerHeaders.get(name));
      }
    }
  });
});

describe('robots.txt (src/app/robots.ts)', () => {
  it('lets crawlers in on production and lists the sitemap index', async () => {
    const result = await withSiteEnv('production', async () => robots());
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
    expect(rules).toContainEqual({ userAgent: '*', allow: '/' });
    expect(rules.some((rule) => rule.disallow)).toBe(false);
    expect(result.sitemap).toBe('https://serplists.com/sitemap.xml');
  });

  it.each(['staging', undefined, 'prod'])('asks every crawler to stay out with SITE_ENV=%s', async (siteEnv) => {
    const result = await withSiteEnv(siteEnv, async () => robots());
    expect(result).toEqual({ rules: { userAgent: '*', disallow: '/' } });
  });
});

describe('site environment helpers', () => {
  it('treats only SITE_ENV=production as production', () => {
    expect(isProductionSite({ SITE_ENV: 'production' })).toBe(true);
    for (const value of ['staging', 'Production', 'prod', '', undefined]) {
      expect(isProductionSite({ SITE_ENV: value }), String(value)).toBe(false);
    }
  });

  it('answers on serplists.com in production and on staging otherwise', () => {
    expect(deploymentOrigin({ SITE_ENV: 'production' })).toBe(CANONICAL_ORIGIN);
    expect(deploymentOrigin({ SITE_ENV: 'staging' })).toBe(STAGING_ORIGIN);
    expect(deploymentOrigin({})).toBe(STAGING_ORIGIN);
  });

  it('builds production canonical URLs in the canonical form, without query strings or hashes', () => {
    expect(CANONICAL_ORIGIN).toBe('https://serplists.com');
    expect(buildCanonicalUrl('https://staging.serplists.com/profile/a/b?x=1#top')).toBe(
      'https://serplists.com/profile/a/b/',
    );
    expect(buildCanonicalUrl('/templates')).toBe('https://serplists.com/templates/');
    expect(buildCanonicalUrl('/templates/')).toBe('https://serplists.com/templates/');
    expect(buildCanonicalUrl('/')).toBe('https://serplists.com/');
    expect(buildCanonicalUrl('/sitemaps/pages/1.xml')).toBe('https://serplists.com/sitemaps/pages/1.xml');
  });
});
