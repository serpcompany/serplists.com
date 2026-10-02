import { seoPage } from '@/components/seo/seoPage';
import { seoFoundBy } from '@/server/pageMeta/pageSeoLookup';
import { loadProfilePageSeo } from '@/server/pageMeta/profilePage';
import { routeParam } from '@/server/routeParam';
import UserProfile from '@/views/UserProfile';

const page = seoPage(
  async (params: Promise<{ username: string }>) =>
    seoFoundBy(await loadProfilePageSeo(routeParam((await params).username))),
  UserProfile,
);

export const generateMetadata = page.generateMetadata;
export default page.Page;
