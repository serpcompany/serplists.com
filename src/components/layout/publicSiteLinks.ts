import {
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

export const publicSiteLinks = [
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
    href: '/pricing',
    label: 'Pricing',
    placements: ['header'],
  },
  {
    footerGroup: 'Company',
    href: '/about',
    label: 'About',
    placements: ['footer'],
  },
  {
    footerGroup: 'Support',
    href: '/contact',
    label: 'Contact',
    placements: ['footer'],
  },
  {
    external: true,
    footerGroup: 'Network',
    href: 'https://serp.dr',
    label: 'SERP DR',
    placements: ['footer'],
  },
] as const satisfies readonly PublicSiteLink[];

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
