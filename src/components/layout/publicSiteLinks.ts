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
  // A line under the label in the header's menus; the pages' own descriptions.
  description?: string;
  external?: boolean;
  href: string;
  label: string;
};

// A header item: one link, or a menu of links under a label. The desktop header shows a menu
// as a NavigationMenu dropdown, and the phone menu sheet as a group of links under the label.
// `section` is the path whose pages mark the menu as the current section.
export type PublicHeaderItem =
  | { kind: 'link'; link: PublicSiteLink }
  | { kind: 'menu'; label: string; links: readonly PublicSiteLink[]; section?: string };

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

// The four feature pages (src/data/publicFeatures.ts).
const featureLinks: readonly PublicSiteLink[] = FEATURES.map((feature) => ({
  description: feature.description,
  href: buildPublicFeaturePath(feature.slug),
  label: feature.title,
}));

export const publicHeaderItems: readonly PublicHeaderItem[] = [
  { kind: 'menu', label: 'Templates', links: templateLinks },
  { kind: 'menu', label: 'Features', links: featureLinks, section: buildPublicFeaturesPath() },
  { kind: 'link', link: { href: buildPricingPath(), label: 'Pricing' } },
];

// The Network column is left out while it is empty. Its 'SERP DR' link pointed at
// https://serp.dr, which cannot resolve (.dr is not a top-level domain). Add it back as an
// external https link once the intended URL is confirmed, and add its domain to the allowlist
// in tests/unit/components/publicSiteLinks.test.ts.
export const publicFooterGroups: readonly PublicFooterGroup[] = [
  { title: 'Templates', items: templateLinks },
  { title: 'Company', items: [{ href: buildAboutPath(), label: 'About' }] },
  { title: 'Support', items: [{ href: buildContactPath(), label: 'Contact' }] },
];

/** Every link the header and the footer render, once each. */
export const publicSiteLinks: readonly PublicSiteLink[] = Array.from(
  new Map(
    [
      ...publicHeaderItems.flatMap((item) => (item.kind === 'menu' ? item.links : [item.link])),
      ...publicFooterGroups.flatMap((group) => group.items),
    ].map((link) => [link.href, link]),
  ).values(),
);
