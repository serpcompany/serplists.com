import type { Env } from '../../api/types';
import { servePublicPage } from '../../seo/page-shell';
import { resolveTemplatePageMeta, routeParam } from '../../seo/public-page-meta';
import { loadPublicTemplate } from '../../seo/public-template-lookup';

// A public template page, with its own title and description for link previews.
export const onRequest: PagesFunction<Env> = (context) =>
  servePublicPage(context, 'template', () =>
    resolveTemplatePageMeta(
      routeParam(context.params.username),
      routeParam(context.params.templateSlug),
      (identifier) => loadPublicTemplate(context.env, context.request, identifier),
    ),
  );
