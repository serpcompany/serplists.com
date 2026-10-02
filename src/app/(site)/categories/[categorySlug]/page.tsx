import { seoPage } from '@/components/seo/seoPage';
import { loadCategoryPageSeo } from '@/server/pageMeta/categoryPage';
import { routeParam } from '@/server/routeParam';
import CategoryDetailRoute from '@/views/CategoryDetailRoute';

const page = seoPage(
  async (params: Promise<{ categorySlug: string }>) => loadCategoryPageSeo(routeParam((await params).categorySlug)),
  CategoryDetailRoute,
);

export const generateMetadata = page.generateMetadata;
export default page.Page;
