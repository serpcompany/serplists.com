import type { Metadata } from 'next';
import type { ComponentType } from 'react';

import { metadataForSeo, type PageSeo } from '@/lib/seo/pageMetadata';

import { WithPageJsonLd } from './WithPageJsonLd';

export function seoPage<Params>(loadSeo: (params: Params) => Promise<PageSeo | null>, View: ComponentType) {
  return {
    generateMetadata: ({ params }: { params: Params }): Promise<Metadata> => metadataForSeo(loadSeo(params)),
    Page: function PageWithSeo({ params }: { params: Params }) {
      return (
        <WithPageJsonLd seo={loadSeo(params)}>
          <View />
        </WithPageJsonLd>
      );
    },
  };
}
