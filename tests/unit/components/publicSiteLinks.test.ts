import { describe, expect, it } from 'vitest';

import { publicFooterGroups, publicHeaderItems } from '@/components/layout/publicSiteLinks';
import { everyPublicSiteLink } from '../../support/publicSiteLinks';

const DOMAINS_CONFIRMED_AS_OURS = ['serp.co', 'serplists.com'];

const isApprovedHost = (hostname: string) =>
  DOMAINS_CONFIRMED_AS_OURS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );

describe('public site links in the header and every public footer', () => {
  it('sends external links over https to a domain confirmed to be ours', () => {
    const external = everyPublicSiteLink.filter((link) => link.external);

    for (const link of external) {
      const url = new URL(link.href);
      expect(url.protocol, link.label).toBe('https:');
      expect(isApprovedHost(url.hostname), `${link.label}: ${url.hostname}`).toBe(true);
    }
  });

  it('keeps internal links as app paths', () => {
    for (const link of everyPublicSiteLink.filter((entry) => !entry.external)) {
      expect(link.href, link.label).toMatch(/^\/(?!\/)/);
    }
  });

  it('renders no empty footer column', () => {
    expect(publicFooterGroups.length).toBeGreaterThan(0);
    for (const group of publicFooterGroups) {
      expect(group.items.length, group.title).toBeGreaterThan(0);
    }
  });

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
  });

  it("describes each header menu link in the page's own words", () => {
    for (const item of publicHeaderItems) {
      if (item.kind === 'menu') for (const link of item.links) expect(link.description, link.label).toBeTruthy();
    }
  });

  it('links the Template Library, Categories and the Profiles directory from the footer', () => {
    expect(publicFooterGroups.map((group) => [group.title, group.items.map((item) => `${item.label} ${item.href}`)])).toEqual([
      ['Templates', ['Template Library /templates/', 'Categories /categories/', 'Profiles /profiles/']],
      ['Company', ['About /about/']],
      ['Support', ['Contact /contact/']],
    ]);
  });
});
