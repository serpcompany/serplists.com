import type { Env } from '../../api/types';
import {
  handleInMemoryPagedSitemap,
  loadCategoryEntries,
} from '../../sitemap/shared';
import { cachedSitemap } from '../../sitemap/cache';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  return cachedSitemap(context, (request) => handleInMemoryPagedSitemap(
    request,
    params.page,
    () => loadCategoryEntries(env),
  ), { kind: 'categories', page: params.page });
};
