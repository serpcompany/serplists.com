import { seoPage } from '@/components/seo/seoPage';
import { seoFoundBy } from '@/server/pageMeta/pageSeoLookup';
import { loadProfilePageSeo } from '@/server/pageMeta/profilePage';
import { routeParam } from '@/server/routeParam';
import PublicProfile from '@/views/PublicProfile';

const page = seoPage(
  async (params: Promise<{ username: string }>) =>
    seoFoundBy(await loadProfilePageSeo(routeParam((await params).username))),
  PublicProfile,
);

export const generateMetadata = page.generateMetadata;
export default page.Page;
