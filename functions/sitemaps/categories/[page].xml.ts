import type { Env } from '../../api/types';
import {
  bundledInventoryLastmod,
  handleInMemoryPagedSitemap,
  loadCategoryEntries,
  mostRecentLastmod,
} from '../../sitemap/shared';
import { cachedSitemap } from '../../sitemap/cache';

export const onRequest: PagesFunction<Env> = async (context) => {
  const { env, params } = context;
  return cachedSitemap(context, (request, revisions) => handleInMemoryPagedSitemap(
    request,
    params.page,
    () => loadCategoryEntries(
      env,
      mostRecentLastmod(
        revisions.get('categories'),
        bundledInventoryLastmod('categories'),
      ),
    ),
  ), { kind: 'categories', page: params.page });
};
