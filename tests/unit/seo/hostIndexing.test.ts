import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildCanonicalUrl, CANONICAL_ORIGIN, isIndexableHost } from '@/lib/seo/siteOrigin';

type HeaderRule = { pattern: string; headers: Array<[string, string]> };

const parseHeadersFile = (source: string): HeaderRule[] => {
  const rules: HeaderRule[] = [];
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

// Cloudflare Pages matching: `*` matches greedily, and a `:placeholder` matches
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

const rules = parseHeadersFile(readFileSync('public/_headers', 'utf8'));

const headersFor = (url: string): Map<string, string[]> => {
  const { hostname, pathname } = new URL(url);
  const applied = new Map<string, string[]>();
  for (const rule of rules) {
    if (!toMatcher(rule.pattern).test(`${hostname}${pathname}`)) continue;
    for (const [name, value] of rule.headers) {
      applied.set(name, [...(applied.get(name) ?? []), value]);
    }
  }
  return applied;
};

const robotsFor = (url: string) => (headersFor(url).get('x-robots-tag') ?? []).join(', ');

describe('host-dependent indexing headers', () => {
  it.each([
    'https://staging.serplists.com/',
    'https://staging.serplists.com/templates',
    'https://staging.serplists.com/profile/test/some-template',
    'https://serp-checklists.pages.dev/',
    'https://serp-checklists.pages.dev/profile/serp/ultimate-camping-checklist',
    'https://staging.serp-checklists.pages.dev/templates',
    'https://1a2b3c4d.serp-checklists.pages.dev/',
  ])('marks %s noindex', (url) => {
    expect(robotsFor(url)).toContain('noindex');
  });

  it.each([
    'https://serplists.com/',
    'https://serplists.com/templates',
    'https://serplists.com/profile/serp/ultimate-camping-checklist',
    'https://serplists.com/robots.txt',
  ])('keeps production page %s indexable', (url) => {
    expect(robotsFor(url)).not.toContain('noindex');
  });

  it('still keeps share pages out of the index on production', () => {
    expect(robotsFor('https://serplists.com/share/abc')).toContain('noindex');
  });

  it('keeps the security headers on non-production hosts', () => {
    const headers = headersFor('https://staging.serplists.com/templates');
    expect(headers.get('content-security-policy')?.length).toBe(1);
    expect(headers.get('strict-transport-security')?.length).toBe(1);
  });
});

describe('site origin helpers', () => {
  it('indexes only the production host', () => {
    expect(isIndexableHost('serplists.com')).toBe(true);
    expect(isIndexableHost('SERPLISTS.com')).toBe(true);
    expect(isIndexableHost('staging.serplists.com')).toBe(false);
    expect(isIndexableHost('serp-checklists.pages.dev')).toBe(false);
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
