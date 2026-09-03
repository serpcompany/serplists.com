import type { Env } from '../../api/types';
import {
  handleInMemoryPagedSitemap,
  loadCategoryEntries,
} from '../../sitemap/shared';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  return handleInMemoryPagedSitemap(
    request,
    params.page,
    () => loadCategoryEntries(env),
  );
};
