import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { loadSharedRunPageSeo } from '@/server/pageMeta/sharedRunPage';
import { routeParam } from '@/server/routeParam';
import ChecklistRun from '@/views/ChecklistRun';

type Props = { params: Promise<{ shareToken: string }> };

const loadSeo = async (params: Props['params']) =>
  loadSharedRunPageSeo(routeParam((await params).shareToken));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const seo = await loadSeo(params);
  return seo ? buildPageMetadata(seo) : { robots: 'noindex, nofollow' };
}

export default function Page({ params }: Props) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={null}>
        <PageJsonLd seo={loadSeo(params)} />
      </Suspense>
      <ChecklistRun />
    </RouteErrorBoundary>
  );
}
