import {
  handleInMemoryPagedSitemap,
  staticSitemapEntries,
} from '../sitemap/shared';

export const onRequest: PagesFunction = async ({ request }) => {
  return handleInMemoryPagedSitemap(request, staticSitemapEntries);
};
