import type { Env } from '../../api/types';
import { servePublicPage } from '../../seo/page-shell';
import { TEMPLATE_LIBRARY_PAGE } from '../../seo/public-page-meta';

// The link preview of /templates, the template library. Only link-preview bots reach this
// path, sent by a Cloudflare URL rewrite (docs/FRONTEND.md, Link previews).
export const onRequest: PagesFunction<Env> = (context) =>
  servePublicPage(context, 'templates', () => TEMPLATE_LIBRARY_PAGE);
