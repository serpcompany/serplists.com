import 'server-only';

import { cache } from 'react';

import { loadPublicTemplate } from '@functions/seo/public-template-lookup';
import { describeErrorForLog, log } from '@functions/api/utils/logger';
import { resolveTemplatePageText, TEMPLATE_NOT_FOUND_PAGE_TEXT } from '@/lib/publicPageMeta';
import {
  findPublicTemplateByIdentifier,
  repoTemplates,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/repoTemplateCatalog';
import { buildCanonicalPublicTemplatePath, buildPublicTemplatePath } from '@/lib/routes';
import type { PageSeo } from '@/lib/seo/pageMetadata';

import { getRequestOrigin, getWorkerEnv } from '../cloudflare';

// found: the page's tags. not_found: a settled answer, so the page is kept out of search.
// unavailable: the lookup failed, which may be brief, so the page keeps the site's defaults
// and stays indexable.
export type TemplatePageSeo =
  | { kind: 'found'; seo: PageSeo }
  | { kind: 'not_found'; seo: PageSeo }
  | { kind: 'unavailable' };

interface TemplatePageSource {
  id: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  createdAt?: string | null;
  categories?: string[];
  canonicalPath: string | null;
}

const toFoundSeo = (template: TemplatePageSource): TemplatePageSeo => {
  const text = resolveTemplatePageText(template);
  return {
    kind: 'found',
    seo: {
      title: text.title,
      description: text.description,
      keywords: template.categories ?? ['checklist', 'template'],
      type: 'article',
      publishedTime: template.createdAt || undefined,
      path: template.canonicalPath ?? undefined,
    },
  };
};

/**
 * What /profile/<username>/<identifier> says in its <head>, found the way the page finds its
 * template (src/features/template-detail/loadTemplateDetail.ts): a bundled library template
 * first, then a public template in D1 whose owner has this username (any letter case), by id
 * or slug. The canonical URL uses the stored username and the slug, as the sitemap does.
 */
export const loadTemplatePageSeo = cache(
  async (username: string, identifier: string): Promise<TemplatePageSeo> => {
    const owner = username.trim().toLowerCase();
    const id = identifier.trim();
    // No canonical URL: the address is not a page.
    const notFound: TemplatePageSeo = {
      kind: 'not_found',
      seo: { ...TEMPLATE_NOT_FOUND_PAGE_TEXT, robots: 'noindex, nofollow' },
    };
    if (!owner || !id) return notFound;

    // Library templates ship in the bundle (the API cannot serve them) and win on a slug clash.
    const libraryTemplate = findPublicTemplateByIdentifier(repoTemplates, id);
    if (libraryTemplate && resolvePublicTemplateOwnerSlug(libraryTemplate)?.toLowerCase() === owner) {
      return toFoundSeo({
        ...libraryTemplate,
        canonicalPath: buildCanonicalPublicTemplatePath(libraryTemplate),
      });
    }

    try {
      const [env, origin] = await Promise.all([getWorkerEnv(), getRequestOrigin()]);
      const record = await loadPublicTemplate(env, origin, id);
      const storedOwner = record?.ownerUsername?.trim();
      if (!record || !storedOwner || storedOwner.toLowerCase() !== owner) return notFound;
      return toFoundSeo({
        ...record,
        canonicalPath: buildPublicTemplatePath(storedOwner, record.slug?.trim() || record.id),
      });
    } catch (error) {
      log('error', 'template_page_meta_failed', describeErrorForLog(error));
      return { kind: 'unavailable' };
    }
  },
);
