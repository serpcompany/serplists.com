import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { buildPageMetadata } from '@/lib/seo/pageMetadata';
import { loadProfilePageSeo } from '@/server/pageMeta/profilePage';
import { routeParam } from '@/server/routeParam';
import UserProfile from '@/views/UserProfile';

type Props = { params: Promise<{ username: string }> };

const loadSeo = async (params: Props['params']) =>
  loadProfilePageSeo(routeParam((await params).username));

// The profile's name and summary, rendered on the server; a profile that does not exist is
// kept out of search, and a failed lookup keeps the site's defaults.
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
      <UserProfile />
    </>
  );
}
