import type { Env } from '../../api/types';
import { createDb } from '../../api/db';
import {
  bundledInventoryLastmod,
  handleInMemoryPagedSitemap,
  loadCategoryEntries,
  loadSitemapRevisions,
  mostRecentLastmod,
} from '../../sitemap/shared';

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  const db = createDb(env);
  const revisions = await loadSitemapRevisions(db);
  return handleInMemoryPagedSitemap(
    request,
    params.page,
    () => loadCategoryEntries(
      db,
      mostRecentLastmod(
        revisions.get('categories'),
        bundledInventoryLastmod('categories'),
      ),
    ),
  );
};
