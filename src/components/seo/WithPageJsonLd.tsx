import { Suspense, type ReactNode } from 'react';

import type { PageSeo } from '@/lib/seo/pageMetadata';

import { PageJsonLd } from './PageJsonLd';

export function WithPageJsonLd({ seo, children }: { seo: Promise<PageSeo | null>; children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <PageJsonLd seo={seo} />
      </Suspense>
      {children}
    </>
  );
}
