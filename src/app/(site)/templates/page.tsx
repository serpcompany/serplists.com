import type { Metadata } from 'next';
import { Suspense } from 'react';

import { JsonLd } from '@/components/seo/JsonLd';
import { TEMPLATE_LIBRARY_PAGE_TEXT } from '@/lib/publicPageMeta';
import { buildPageJsonLd, buildPageMetadata, type PageSeo } from '@/lib/seo/pageMetadata';
import ChecklistLibrary, { ChecklistLibrarySkeleton } from '@/views/ChecklistLibrary';

const seo: PageSeo = {
  ...TEMPLATE_LIBRARY_PAGE_TEXT,
  keywords: ['checklist templates', 'workflow templates', 'SOP templates'],
  path: '/templates',
};

export const metadata: Metadata = buildPageMetadata(seo);

export default function Page() {
  return (
    <>
      <JsonLd data={buildPageJsonLd(seo)} />
      {/* The library keeps its filters in the query, which a statically rendered page only
          knows in the browser: the server sends the loading layout. */}
      <Suspense fallback={<ChecklistLibrarySkeleton />}>
        <ChecklistLibrary />
      </Suspense>
    </>
  );
}
