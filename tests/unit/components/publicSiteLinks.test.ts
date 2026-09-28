import { describe, expect, it } from 'vitest';

import {
  publicFooterGroups,
  publicHeaderLinks,
  publicSiteLinks,
} from '@/components/layout/publicSiteLinks';

// The header and every public page's footer render these links. An outbound link must go
// to a domain we have confirmed; an exact-href test once locked in https://serp.dr, a
// domain under a top-level domain that does not exist. Add a domain here only once
// someone has confirmed it is ours.
const APPROVED_EXTERNAL_DOMAINS = ['serp.co', 'serplists.com'];

const isApprovedHost = (hostname: string) =>
  APPROVED_EXTERNAL_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );

describe('public site links', () => {
  it('sends external links over https to an approved domain', () => {
    const external = publicSiteLinks.filter((link) => link.external);

    for (const link of external) {
      const url = new URL(link.href);
      expect(url.protocol, link.label).toBe('https:');
      expect(isApprovedHost(url.hostname), `${link.label}: ${url.hostname}`).toBe(true);
    }
  });

  it('keeps internal links as app paths', () => {
    for (const link of publicSiteLinks.filter((entry) => !entry.external)) {
      expect(link.href, link.label).toMatch(/^\/(?!\/)/);
    }
  });

  it('renders no empty footer column and keeps the header links', () => {
    expect(publicFooterGroups.length).toBeGreaterThan(0);
    for (const group of publicFooterGroups) {
      expect(group.items.length, group.title).toBeGreaterThan(0);
    }
    expect(publicHeaderLinks.map((link) => link.label)).toEqual([
      'Templates',
      'Features',
      'Pricing',
    ]);
  });
});
