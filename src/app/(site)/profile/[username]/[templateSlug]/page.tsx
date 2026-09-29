import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { loadTemplatePageSeo } from '@/server/pageMeta/templatePage';
import { routeParam } from '@/server/routeParam';
import PublicTemplate from '@/views/PublicTemplate';

type Props = { params: Promise<{ username: string; templateSlug: string }> };

const loadSeo = async (params: Props['params']) => {
  const { username, templateSlug } = await params;
  return loadTemplatePageSeo(routeParam(username), routeParam(templateSlug));
};

// The template's own title, description, canonical URL and link preview, rendered on the
// server; a template that is gone is kept out of search, and a failed lookup keeps the
// site's defaults.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const result = await loadSeo(params);
  return result.kind === 'unavailable' ? {} : buildPageMetadata(result.seo);
}

export default function Page({ params }: Props) {
  const seo = loadSeo(params).then((result) => (result.kind === 'unavailable' ? null : result.seo));
  return (
    <>
      <Suspense fallback={null}>
        <PageJsonLd seo={seo} />
      </Suspense>
      <PublicTemplate />
    </>
  );
}
