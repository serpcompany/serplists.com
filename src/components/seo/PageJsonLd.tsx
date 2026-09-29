import { buildPageJsonLd, type PageSeo } from '@/lib/seo/pageMetadata';

import { JsonLd } from './JsonLd';

/**
 * A page's JSON-LD from a lookup still in flight. Render it inside <Suspense> so the rest of
 * the page streams without waiting for the lookup.
 */
export async function PageJsonLd({ seo }: { seo: Promise<PageSeo | null> }) {
  const resolved = await seo;
  return resolved ? <JsonLd data={buildPageJsonLd(resolved)} /> : null;
}
