import { readFileSync } from 'node:fs';
import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { matchHas } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { describe, expect, it } from 'vitest';

import nextConfigFor from '../../../next.config';
import { buildCanonicalUrl, CANONICAL_ORIGIN, isIndexableHost } from '@/lib/seo/siteOrigin';

// Only https://serplists.com may be indexed. The Worker's pages and API responses get their
// headers from next.config.ts; the static files Workers Static Assets serves without running
// the Worker get theirs from public/_headers. Both must mark staging and every *.workers.dev
// host noindex, and neither may touch production.

type Header = { key: string; value: string };
type HeaderRule = {
  source: string;
  headers: Header[];
  has?: Parameters<typeof matchHas>[2];
  missing?: Parameters<typeof matchHas>[3];
};

const nextHeaderRules = (await nextConfigFor(PHASE_PRODUCTION_SERVER).headers?.()) as HeaderRule[];

// Matched the way the built routes manifest does (a path-to-regexp source with an optional
// trailing slash, so '/:path*' also covers '/'; a host `has` value is an anchored regex).
const workerHeadersFor = (url: string): Map<string, string[]> => {
  const { host, pathname, searchParams } = new URL(url);
  const applied = new Map<string, string[]>();
  for (const rule of nextHeaderRules) {
    if (getPathMatch(rule.source, { removeUnnamedParams: true })(pathname) === false) continue;
    const request = { headers: { host } } as unknown as Parameters<typeof matchHas>[0];
    if (matchHas(request, Object.fromEntries(searchParams), rule.has, rule.missing) === false) continue;
    for (const { key, value } of rule.headers) {
      applied.set(key.toLowerCase(), [...(applied.get(key.toLowerCase()) ?? []), value]);
    }
  }
  return applied;
};

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

// Cloudflare's _headers matching: `*` matches greedily, and a `:placeholder` matches
// anything except `.` or `/` in the host and anything except `/` in the path.
const toMatcher = (pattern: string): RegExp => {
  const absolute = pattern.match(/^https:\/\/([^/]+)(\/.*)$/);
  const convert = (part: string, placeholder: string) =>
    part
      .split(/(\*|:[A-Za-z]\w*)/)
      .map((token) => {
        if (token === '*') return '.*';
        if (/^:[A-Za-z]\w*$/.test(token)) return placeholder;
        return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
  return absolute
    ? new RegExp(`^${convert(absolute[1], '[^./]+')}${convert(absolute[2], '[^/]+')}$`)
    : new RegExp(`^[^/]+${convert(pattern, '[^/]+')}$`);
};

const staticRules = parseHeadersFile(readFileSync('public/_headers', 'utf8'));

const staticHeadersFor = (url: string): Map<string, string[]> => {
  const { hostname, pathname } = new URL(url);
  const applied = new Map<string, string[]>();
  for (const rule of staticRules) {
    if (!toMatcher(rule.pattern).test(`${hostname}${pathname}`)) continue;
    for (const [name, value] of rule.headers) {
      applied.set(name, [...(applied.get(name) ?? []), value]);
    }
  }
  return applied;
};

const robots = (headers: Map<string, string[]>) => (headers.get('x-robots-tag') ?? []).join(', ');

const NON_PRODUCTION = [
  'https://staging.serplists.com/',
  'https://staging.serplists.com/templates',
  'https://staging.serplists.com/profile/test/some-template',
  'https://serp-checklists-preview.serp.workers.dev/',
  'https://serp-checklists-production.serp.workers.dev/profile/serp/ultimate-camping-checklist',
  'https://serp-checklists-preview.serp.workers.dev/api/templates',
];

const PRODUCTION = [
  'https://serplists.com/',
  'https://serplists.com/templates',
  'https://serplists.com/profile/serp/ultimate-camping-checklist',
  'https://serplists.com/api/templates',
];

describe('host-dependent indexing headers on pages and API responses (next.config.ts)', () => {
  it.each(NON_PRODUCTION)('marks %s noindex', (url) => {
    expect(robots(workerHeadersFor(url))).toContain('noindex');
  });

  it.each(PRODUCTION)('keeps production %s indexable', (url) => {
    expect(robots(workerHeadersFor(url))).not.toContain('noindex');
  });

  it('still keeps share pages out of the index on production', () => {
    expect(robots(workerHeadersFor('https://serplists.com/share/abc'))).toContain('noindex');
  });

  it('sends the security headers once on every host', () => {
    for (const url of [
      'https://serplists.com/templates',
      'https://staging.serplists.com/api/health',
      'http://localhost:3000/dashboard',
      'http://127.0.0.1:4173/',
    ]) {
      const headers = workerHeadersFor(url);
      expect(headers.get('content-security-policy')?.length, url).toBe(1);
      expect(headers.get('strict-transport-security')?.length, url).toBe(1);
    }
  });

  // On http://localhost the browser applied upgrade-insecure-requests to the redirects the
  // app's navigations follow (/dashboard to /dashboard/templates), asked for https, and the
  // navigation stalled until Next.js gave up and reloaded the page.
  it('upgrades insecure requests on the deployed hosts only', () => {
    for (const url of ['https://serplists.com/', 'https://staging.serplists.com/dashboard', 'https://serp-checklists-preview.serp.workers.dev/']) {
      expect(workerHeadersFor(url).get('content-security-policy')?.[0], url).toContain('upgrade-insecure-requests');
    }
    for (const url of ['http://localhost:3000/dashboard', 'http://127.0.0.1:4173/']) {
      const [policy] = workerHeadersFor(url).get('content-security-policy') ?? [];
      expect(policy, url).not.toContain('upgrade-insecure-requests');
      expect(policy, url).toBe(workerHeadersFor('https://serplists.com/').get('content-security-policy')?.[0].replace(/; upgrade-insecure-requests$/, ''));
    }
  });
});

describe('host-dependent indexing headers on static files (public/_headers)', () => {
  it.each([
    'https://staging.serplists.com/og-default.png',
    'https://serp-checklists-preview.serp.workers.dev/_next/static/chunks/app.js',
    'https://serp-checklists-production.serp.workers.dev/robots.txt',
  ])('marks %s noindex', (url) => {
    expect(robots(staticHeadersFor(url))).toContain('noindex');
  });

  it.each(['https://serplists.com/og-default.png', 'https://serplists.com/robots.txt'])(
    'keeps production file %s indexable',
    (url) => {
      expect(robots(staticHeadersFor(url))).not.toContain('noindex');
    },
  );

  it('keeps the security headers on every host, the same as the Worker sends', () => {
    const staticHeaders = staticHeadersFor('https://staging.serplists.com/og-default.png');
    const workerHeaders = workerHeadersFor('https://staging.serplists.com/templates');
    for (const name of ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'permissions-policy']) {
      expect(staticHeaders.get(name), name).toEqual(workerHeaders.get(name));
    }
  });
});

describe('site origin helpers', () => {
  it('indexes only the production host', () => {
    expect(isIndexableHost('serplists.com')).toBe(true);
    expect(isIndexableHost('SERPLISTS.com')).toBe(true);
    expect(isIndexableHost('staging.serplists.com')).toBe(false);
    expect(isIndexableHost('serp-checklists-preview.serp.workers.dev')).toBe(false);
    expect(isIndexableHost('localhost')).toBe(false);
    expect(isIndexableHost(undefined)).toBe(false);
  });

  it('builds production canonical URLs without query strings or hashes', () => {
    expect(CANONICAL_ORIGIN).toBe('https://serplists.com');
    expect(buildCanonicalUrl('https://staging.serplists.com/profile/a/b?x=1#top')).toBe(
      'https://serplists.com/profile/a/b',
    );
    expect(buildCanonicalUrl('/templates')).toBe('https://serplists.com/templates');
  });
});
