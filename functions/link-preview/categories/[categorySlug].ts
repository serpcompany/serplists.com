import type { Env } from '../../api/types';
import { servePublicPage } from '../../seo/page-shell';
import { resolveCategoryPageMeta, routeParam } from '../../seo/public-page-meta';

// The link preview of /categories/<categorySlug>, named for its category. Only link-preview
// bots reach this path, sent by a Cloudflare URL rewrite (docs/FRONTEND.md, Link previews).
export const onRequest: PagesFunction<Env> = (context) =>
  servePublicPage(context, 'category', () => resolveCategoryPageMeta(routeParam(context.params.categorySlug)));
