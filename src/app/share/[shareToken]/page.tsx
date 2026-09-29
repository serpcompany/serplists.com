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

// A share link shows one person's run: its title, never indexed (next.config.ts also sends
// X-Robots-Tag for /share).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const seo = await loadSeo(params);
  return seo ? buildPageMetadata(seo) : { robots: 'noindex, nofollow' };
}

// A run opened through its share link: no site header, since a guest may not have an account.
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
