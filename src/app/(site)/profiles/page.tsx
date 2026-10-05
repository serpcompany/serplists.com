import type { Metadata } from 'next';
import { Suspense } from 'react';

import { JsonLd } from '@/components/seo/JsonLd';
import { PROFILES_DIRECTORY_PAGE_TEXT } from '@/lib/publicPageMeta';
import { buildProfilesDirectoryPath } from '@/lib/routes';
import { buildPageJsonLd, buildPageMetadata, type PageSeo } from '@/lib/seo/pageMetadata';
import ProfilesDirectory, { ProfilesDirectoryFallback } from '@/views/ProfilesDirectory';

const seo: PageSeo = {
  ...PROFILES_DIRECTORY_PAGE_TEXT,
  keywords: ['public profiles', 'template creators', 'checklist templates'],
  path: buildProfilesDirectoryPath(),
};

export const metadata: Metadata = buildPageMetadata(seo);

export default function Page() {
  return (
    <>
      <JsonLd data={buildPageJsonLd(seo)} />
      <Suspense fallback={<ProfilesDirectoryFallback />}>
        <ProfilesDirectory />
      </Suspense>
    </>
  );
}
