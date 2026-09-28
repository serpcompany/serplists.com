import type { Env } from '../../api/types';
import {
  bundledInventoryLastmod,
  cachedSitemap,
  handleInMemoryPagedSitemap,
  loadCategoryEntries,
  mostRecentLastmod,
} from '../../sitemap/shared';

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
  ));
};
