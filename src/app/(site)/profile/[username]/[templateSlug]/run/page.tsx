import type { Metadata } from 'next';

import { metadataForSeo } from '@/lib/seo/pageMetadata';
import { guestRunSeoFor } from '@/server/pageMeta/pageSeoLookup';
import { loadTemplatePageSeo } from '@/server/pageMeta/templatePage';
import { routeParam } from '@/server/routeParam';
import GuestRun from '@/views/GuestRun';

type Props = { params: Promise<{ username: string; templateSlug: string }> };

const loadSeo = async (params: Props['params']) => {
  const { username, templateSlug } = await params;
  return guestRunSeoFor(await loadTemplatePageSeo(routeParam(username), routeParam(templateSlug)));
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadataForSeo(loadSeo(params), { robots: 'noindex, follow' });
}

export default function Page() {
  return <GuestRun />;
}
