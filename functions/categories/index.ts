import type { Env } from '../api/types';
import { servePublicPage } from '../seo/page-shell';
import { CATEGORY_INDEX_PAGE } from '../seo/public-page-meta';

// /categories, described for link previews.
export const onRequest: PagesFunction<Env> = (context) =>
  servePublicPage(context, 'categories', () => CATEGORY_INDEX_PAGE);
