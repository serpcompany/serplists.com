import { buildPageJsonLd, type PageSeo } from '@/lib/seo/pageMetadata';

import { JsonLd } from './JsonLd';

export async function PageJsonLd({ seo }: { seo: Promise<PageSeo | null> }) {
  const resolved = await seo;
  return resolved ? <JsonLd data={buildPageJsonLd(resolved)} /> : null;
}
