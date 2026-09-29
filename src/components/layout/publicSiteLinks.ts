import {
  buildAboutPath,
  buildContactPath,
  buildPricingPath,
  buildPublicFeaturesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';

export type PublicSiteLinkPlacement = 'header' | 'footer';
export type PublicSiteLinkFooterGroup = 'Company' | 'Support' | 'Network';

export type PublicSiteLink = {
  external?: boolean;
  footerGroup?: PublicSiteLinkFooterGroup;
  href: string;
  label: string;
  placements: PublicSiteLinkPlacement[];
};

export const publicSiteLinks: readonly PublicSiteLink[] = [
  {
    href: buildPublicTemplatesPath(),
    label: 'Templates',
    placements: ['header'],
  },
  {
    href: buildPublicFeaturesPath(),
    label: 'Features',
    placements: ['header'],
  },
  {
    href: buildPricingPath(),
    label: 'Pricing',
    placements: ['header'],
  },
  {
    footerGroup: 'Company',
    href: buildAboutPath(),
    label: 'About',
    placements: ['footer'],
  },
  {
    footerGroup: 'Support',
    href: buildContactPath(),
    label: 'Contact',
    placements: ['footer'],
  },
  // The Network column is empty, so the footer leaves it out. Its 'SERP DR' link pointed
  // at https://serp.dr, which cannot resolve (.dr is not a top-level domain). Add it back
  // as an external https link once the intended URL is confirmed, and add its domain to
  // the allowlist in tests/unit/components/publicSiteLinks.test.ts.
];

const publicFooterGroupOrder: readonly PublicSiteLinkFooterGroup[] = [
  'Company',
  'Support',
  'Network',
];

export const publicHeaderLinks = publicSiteLinks.filter((link) =>
  link.placements.includes('header'),
);

export const publicFooterGroups = publicFooterGroupOrder
  .map((title) => ({
    items: publicSiteLinks.filter(
      (link) =>
        link.placements.includes('footer') && link.footerGroup === title,
    ),
    title,
  }))
  .filter((group) => group.items.length > 0);
