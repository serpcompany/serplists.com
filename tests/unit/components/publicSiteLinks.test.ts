import { describe, expect, it } from 'vitest';

import {
  publicFooterGroups,
  publicHeaderItems,
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

  it('renders no empty footer column', () => {
    expect(publicFooterGroups.length).toBeGreaterThan(0);
    for (const group of publicFooterGroups) {
      expect(group.items.length, group.title).toBeGreaterThan(0);
    }
  });

  // The header: "Templates" and "Features" menus, then Pricing as one link.
  it('groups the header into the Templates and Features menus and the Pricing link', () => {
    expect(
      publicHeaderItems.map((item) =>
        item.kind === 'menu'
          ? { menu: item.label, links: item.links.map((link) => `${link.label} ${link.href}`) }
          : { link: `${item.link.label} ${item.link.href}` },
      ),
    ).toEqual([
      { menu: 'Templates', links: ['Template Library /templates/', 'Categories /categories/'] },
      {
        menu: 'Features',
        links: [
          'Template Builder /features/template-builder/',
          'Checklist Runs /features/checklist-runs/',
          'Public Sharing /features/public-sharing/',
          'Import + Export /features/import-export/',
        ],
      },
      { link: 'Pricing /pricing/' },
    ]);
    // Each menu link says what the page is, in the page's own words.
    for (const item of publicHeaderItems) {
      if (item.kind === 'menu') for (const link of item.links) expect(link.description, link.label).toBeTruthy();
    }
  });

  it('links the Template Library and Categories from the footer too', () => {
    expect(publicFooterGroups.map((group) => [group.title, group.items.map((item) => item.href)])).toEqual([
      ['Templates', ['/templates/', '/categories/']],
      ['Company', ['/about/']],
      ['Support', ['/contact/']],
    ]);
  });
});
