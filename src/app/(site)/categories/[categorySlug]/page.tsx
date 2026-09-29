import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { loadCategoryPageSeo } from '@/server/pageMeta/categoryPage';
import { routeParam } from '@/server/routeParam';
import CategoryDetailRoute from '@/views/CategoryDetailRoute';

type Props = { params: Promise<{ categorySlug: string }> };

const loadSeo = async (params: Props['params']) =>
  loadCategoryPageSeo(routeParam((await params).categorySlug));

// The category's name, template count and canonical URL, rendered on the server. A category
// the server cannot name keeps the site's defaults, and the page decides in the browser.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const seo = await loadSeo(params);
  return seo ? buildPageMetadata(seo) : {};
}

export default function Page({ params }: Props) {
  return (
    <>
      <Suspense fallback={null}>
        <PageJsonLd seo={loadSeo(params)} />
      </Suspense>
      <CategoryDetailRoute />
    </>
  );
}
