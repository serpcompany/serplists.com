import type { Env } from '../../../api/types';
import { servePublicPage } from '../../../seo/page-shell';
import { resolveTemplatePageMeta, routeParam } from '../../../seo/public-page-meta';
import { loadPublicTemplate } from '../../../seo/public-template-lookup';

// The link preview of /profile/<username>/<templateSlug>: that page's HTML with the
// template's own title and description. Only link-preview bots reach this path, sent by a
// Cloudflare URL rewrite (docs/FRONTEND.md, Link previews); people get the free static page.
export const onRequest: PagesFunction<Env> = (context) =>
  servePublicPage(context, 'template', () =>
    resolveTemplatePageMeta(
      routeParam(context.params.username),
      routeParam(context.params.templateSlug),
      (identifier) => loadPublicTemplate(context.env, context.request, identifier),
    ),
  );
