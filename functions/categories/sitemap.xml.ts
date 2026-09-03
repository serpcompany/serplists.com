import type { Env } from '../api/types';
import {
  loadCategorySlugs,
  handleInMemoryPagedSitemap,
} from '../sitemap/shared';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  return handleInMemoryPagedSitemap(
    request,
    async () => (await loadCategorySlugs(env)).map((slug) => ({
      path: `/categories/${encodeURIComponent(slug)}`,
    })),
  );
};
