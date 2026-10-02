import type { Metadata } from 'next';

import { RouteErrorBoundary } from '@/components/RouteErrorBoundary';
import { WithPageJsonLd } from '@/components/seo/WithPageJsonLd';
import { metadataForSeo } from '@/lib/seo/pageMetadata';
import { loadSharedRunPageSeo } from '@/server/pageMeta/sharedRunPage';
import { routeParam } from '@/server/routeParam';
import ChecklistRun from '@/views/ChecklistRun';

type Props = { params: Promise<{ shareToken: string }> };

const loadSeo = async (params: Props['params']) =>
  loadSharedRunPageSeo(routeParam((await params).shareToken));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataForSeo(loadSeo(params), { robots: 'noindex, nofollow' });
}

export default function Page({ params }: Props) {
  return (
    <RouteErrorBoundary>
      <WithPageJsonLd seo={loadSeo(params)}>
        <ChecklistRun />
      </WithPageJsonLd>
    </RouteErrorBoundary>
  );
}
