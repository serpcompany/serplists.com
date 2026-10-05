import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';

import { metadataForSeo } from '@/lib/seo/pageMetadata';
import { guestRunSeoFor } from '@/server/pageMeta/pageSeoLookup';
import { loadTemplatePageSeo, type TemplatePageLookup } from '@/server/pageMeta/templatePage';
import { routeParam, routeQuery, type RouteSearchParams } from '@/server/routeParam';
import GuestRun from '@/views/GuestRun';

type GuestRunParams = Promise<{ username: string; templateSlug: string }>;

const lookUp = async (params: GuestRunParams): Promise<TemplatePageLookup> => {
  const { username, templateSlug } = await params;
  return loadTemplatePageSeo(routeParam(username), routeParam(templateSlug));
};

const guestRunPathOf = (templatePath: string): string => `${templatePath}run/`;

export async function generateMetadata({ params }: { params: GuestRunParams }): Promise<Metadata> {
  const lookup = await lookUp(params);
  if (lookup.kind === 'moved') permanentRedirect(guestRunPathOf(lookup.path));
  return metadataForSeo(Promise.resolve(guestRunSeoFor(lookup)), { robots: 'noindex, follow' });
}

export default async function Page({
  params,
  searchParams,
}: {
  params: GuestRunParams;
  searchParams: Promise<RouteSearchParams>;
}) {
  const lookup = await lookUp(params);
  if (lookup.kind === 'moved') permanentRedirect(`${guestRunPathOf(lookup.path)}${routeQuery(await searchParams)}`);
  return <GuestRun />;
}
