import type { PageSeo } from '@/lib/seo/pageMetadata';

export type PageSeoLookup =
  | { kind: 'found'; seo: PageSeo }
  | { kind: 'not_found'; seo: PageSeo }
  | { kind: 'unavailable' };

export const seoFoundBy = (lookup: PageSeoLookup): PageSeo | null => (lookup.kind === 'unavailable' ? null : lookup.seo);
