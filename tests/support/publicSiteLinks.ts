import { publicFooterGroups, publicHeaderItems, type PublicSiteLink } from '@/components/layout/publicSiteLinks';

const linksByHref = new Map<string, PublicSiteLink>(
  [
    ...publicHeaderItems.flatMap((item) => (item.kind === 'menu' ? item.links : [item.link])),
    ...publicFooterGroups.flatMap((group) => group.items),
  ].map((link) => [link.href, link]),
);

export const everyPublicSiteLink: readonly PublicSiteLink[] = [...linksByHref.values()];
