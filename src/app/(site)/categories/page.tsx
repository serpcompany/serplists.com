import type { Metadata } from 'next';

import { JsonLd } from '@/components/seo/JsonLd';
import { CATEGORY_INDEX_PAGE_TEXT } from '@/lib/publicPageMeta';
import { buildPublicCategoriesPath } from '@/lib/routes';
import { buildPageJsonLd, buildPageMetadata, type PageSeo } from '@/lib/seo/pageMetadata';
import Categories from '@/views/Categories';

const seo: PageSeo = {
  ...CATEGORY_INDEX_PAGE_TEXT,
  keywords: ['template categories', 'checklist categories', 'workflow templates'],
  path: buildPublicCategoriesPath(),
};

export const metadata: Metadata = buildPageMetadata(seo);

export default function Page() {
  return (
    <>
      <JsonLd data={buildPageJsonLd(seo)} />
      <Categories />
    </>
  );
}
