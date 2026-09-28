import type { Env } from '../api/types';
import { servePublicPage } from '../seo/page-shell';
import { resolveCategoryPageMeta, routeParam } from '../seo/public-page-meta';

// A category page, named for link previews. The static sitemap.xml.ts beside this file
// still answers /categories/sitemap.xml: Pages matches static routes before dynamic ones.
export const onRequest: PagesFunction<Env> = (context) =>
  servePublicPage(context, 'category', () => resolveCategoryPageMeta(routeParam(context.params.categorySlug)));
