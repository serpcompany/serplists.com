import type { Metadata } from 'next';
import { Suspense } from 'react';

import { JsonLd } from '@/components/seo/JsonLd';
import { TEMPLATE_LIBRARY_PAGE_TEXT } from '@/lib/publicPageMeta';
import { buildPublicTemplatesPath } from '@/lib/routes';
import { buildPageJsonLd, buildPageMetadata, type PageSeo } from '@/lib/seo/pageMetadata';
import ChecklistLibrary, { ChecklistLibrarySkeleton } from '@/views/ChecklistLibrary';

const seo: PageSeo = {
  ...TEMPLATE_LIBRARY_PAGE_TEXT,
  keywords: ['checklist templates', 'workflow templates', 'SOP templates'],
  path: buildPublicTemplatesPath(),
};

export const metadata: Metadata = buildPageMetadata(seo);

export default function Page() {
  return (
    <>
      <JsonLd data={buildPageJsonLd(seo)} />
      <Suspense fallback={<ChecklistLibrarySkeleton />}>
        <ChecklistLibrary />
      </Suspense>
    </>
  );
}
