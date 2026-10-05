import type { PageSeo } from '@/lib/seo/pageMetadata';

export type PageSeoLookup =
  | { kind: 'found'; seo: PageSeo }
  | { kind: 'not_found'; seo: PageSeo }
  | { kind: 'unavailable' };

export const seoFoundBy = (lookup: PageSeoLookup): PageSeo | null => (lookup.kind === 'unavailable' ? null : lookup.seo);

export const guestRunSeoFor = (templateLookup: PageSeoLookup): PageSeo | null => {
  if (templateLookup.kind !== 'found') return seoFoundBy(templateLookup);
  const { path, ...templateSeo } = templateLookup.seo;
  return { ...templateSeo, robots: 'noindex, follow' };
};
