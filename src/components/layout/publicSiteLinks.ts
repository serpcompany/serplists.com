import { FEATURES } from '@/data/publicFeatures';
import { CATEGORY_INDEX_PAGE_TEXT, TEMPLATE_LIBRARY_PAGE_TEXT } from '@/lib/publicPageMeta';
import {
  buildAboutPath,
  buildContactPath,
  buildPricingPath,
  buildPublicCategoriesPath,
  buildPublicFeaturePath,
  buildPublicFeaturesPath,
  buildPublicTemplatesPath,
} from '@/lib/routes';

export type PublicSiteLink = {
  description?: string;
  external?: boolean;
  href: string;
  label: string;
};

export type PublicHeaderItem =
  | { kind: 'link'; link: PublicSiteLink }
  | { kind: 'menu'; label: string; links: readonly PublicSiteLink[]; sectionPath?: string };

export type PublicFooterGroup = { title: string; items: readonly PublicSiteLink[] };

const templateLinks: readonly PublicSiteLink[] = [
  {
    description: TEMPLATE_LIBRARY_PAGE_TEXT.description,
    href: buildPublicTemplatesPath(),
    label: 'Template Library',
  },
  {
    description: CATEGORY_INDEX_PAGE_TEXT.description,
    href: buildPublicCategoriesPath(),
    label: 'Categories',
  },
];

const featureLinks: readonly PublicSiteLink[] = FEATURES.map((feature) => ({
  description: feature.description,
  href: buildPublicFeaturePath(feature.slug),
  label: feature.title,
}));

export const publicHeaderItems: readonly PublicHeaderItem[] = [
  { kind: 'menu', label: 'Templates', links: templateLinks },
  { kind: 'menu', label: 'Features', links: featureLinks, sectionPath: buildPublicFeaturesPath() },
  { kind: 'link', link: { href: buildPricingPath(), label: 'Pricing' } },
];

export const publicFooterGroups: readonly PublicFooterGroup[] = [
  { title: 'Templates', items: templateLinks },
  { title: 'Company', items: [{ href: buildAboutPath(), label: 'About' }] },
  { title: 'Support', items: [{ href: buildContactPath(), label: 'Contact' }] },
];

export const publicSiteLinks: readonly PublicSiteLink[] = Array.from(
  new Map(
    [
      ...publicHeaderItems.flatMap((item) => (item.kind === 'menu' ? item.links : [item.link])),
      ...publicFooterGroups.flatMap((group) => group.items),
    ].map((link) => [link.href, link]),
  ).values(),
);
