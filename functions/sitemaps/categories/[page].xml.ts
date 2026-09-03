import type { Env } from '../../api/types';
import {
  bundledInventoryLastmod,
  handleInMemoryPagedSitemap,
  loadCategoryEntries,
  loadSitemapRevisions,
  mostRecentLastmod,
} from '../../sitemap/shared';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const revisions = await loadSitemapRevisions(env);
  return handleInMemoryPagedSitemap(
    request,
    params.page,
    () => loadCategoryEntries(
      env,
      mostRecentLastmod(
        revisions.get('categories'),
        bundledInventoryLastmod('categories'),
      ),
    ),
  );
};
