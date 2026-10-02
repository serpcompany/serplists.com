import { seoPage } from '@/components/seo/seoPage';
import { seoFoundBy } from '@/server/pageMeta/pageSeoLookup';
import { loadTemplatePageSeo } from '@/server/pageMeta/templatePage';
import { routeParam } from '@/server/routeParam';
import PublicTemplate from '@/views/PublicTemplate';

const page = seoPage(async (params: Promise<{ username: string; templateSlug: string }>) => {
  const { username, templateSlug } = await params;
  return seoFoundBy(await loadTemplatePageSeo(routeParam(username), routeParam(templateSlug)));
}, PublicTemplate);

export const generateMetadata = page.generateMetadata;
export default page.Page;
