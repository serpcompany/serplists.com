import type { Env } from '../api/types';
import { servePublicPage } from '../seo/page-shell';
import { TEMPLATE_LIBRARY_PAGE } from '../seo/public-page-meta';

// /templates, the template library, described for link previews.
export const onRequest: PagesFunction<Env> = (context) =>
  servePublicPage(context, 'templates', () => TEMPLATE_LIBRARY_PAGE);
