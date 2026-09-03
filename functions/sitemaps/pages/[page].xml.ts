import {
  handleInMemoryPagedSitemap,
  staticSitemapEntries,
} from '../../sitemap/shared';

export const onRequest: PagesFunction = async ({ request, params }) => {
  return handleInMemoryPagedSitemap(request, params.page, staticSitemapEntries);
};
