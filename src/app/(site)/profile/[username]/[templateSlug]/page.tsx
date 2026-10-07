import { permanentRedirect } from 'next/navigation';

import { seoPage } from '@/components/seo/seoPage';
import { seoFoundBy } from '@/server/pageMeta/pageSeoLookup';
import { loadTemplatePageSeo, type TemplatePageLookup } from '@/server/pageMeta/templatePage';
import { routeParam, routeQuery, type RouteSearchParams } from '@/server/routeParam';
import PublicTemplate from '@/views/PublicTemplate';

type TemplatePageParams = Promise<{ username: string; templateSlug: string }>;

const lookUp = async (params: TemplatePageParams): Promise<TemplatePageLookup> => {
  const { username, templateSlug } = await params;
  return loadTemplatePageSeo(routeParam(username), routeParam(templateSlug));
};

const page = seoPage(async (params: TemplatePageParams) => {
  const lookup = await lookUp(params);
  if (lookup.kind === 'moved') permanentRedirect(lookup.path);
  return seoFoundBy(lookup);
}, PublicTemplate);

export const generateMetadata = page.generateMetadata;

export default async function PublicTemplatePage({
  params,
  searchParams,
}: {
  params: TemplatePageParams;
  searchParams: Promise<RouteSearchParams>;
}) {
  const lookup = await lookUp(params);
  if (lookup.kind === 'moved') permanentRedirect(`${lookup.path}${routeQuery(await searchParams)}`);
  return <page.Page params={params} />;
}
