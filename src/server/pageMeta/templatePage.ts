import 'server-only';

import { cache } from 'react';

import { loadPublicTemplate } from '@functions/seo/public-template-lookup';
import { describeErrorForLog, log } from '@functions/api/utils/logger';
import {
  resolveTemplatePageText,
  TEMPLATE_NOT_FOUND_PAGE_TEXT,
  type TemplatePageSource,
} from '@/lib/publicPageMeta';
import {
  findPublicTemplateByIdentifier,
  repoTemplates,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/repoTemplateCatalog';
import { buildCanonicalPublicTemplatePath, buildPublicTemplatePath } from '@/lib/routes';

import { getRequestOrigin, getWorkerEnv } from '../cloudflare';
import type { PageSeoLookup } from './pageSeoLookup';

type FoundTemplatePage = TemplatePageSource & {
  createdAt?: string | null;
  categories?: string[];
  canonicalPath: string | null;
};

const toFoundSeo = (template: FoundTemplatePage): PageSeoLookup => {
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

export const loadTemplatePageSeo = cache(
  async (username: string, identifier: string): Promise<PageSeoLookup> => {
    const owner = username.trim().toLowerCase();
    const id = identifier.trim();
    const notFound: PageSeoLookup = {
      kind: 'not_found',
      seo: { ...TEMPLATE_NOT_FOUND_PAGE_TEXT, robots: 'noindex, nofollow' },
    };
    if (!owner || !id) return notFound;

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
