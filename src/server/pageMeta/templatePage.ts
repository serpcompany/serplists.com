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

export type TemplatePageLookup = PageSeoLookup | { kind: 'moved'; path: string };

type FoundTemplatePage = TemplatePageSource & {
  createdAt?: string | null;
  categories?: string[];
  canonicalPath: string | null;
};

const toFoundSeo = (template: FoundTemplatePage): TemplatePageLookup => {
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

const isTheHandle = (handle: string | null | undefined, owner: string) => handle?.trim().toLowerCase() === owner;

export const loadTemplatePageSeo = cache(
  async (handle: string, identifier: string): Promise<TemplatePageLookup> => {
    const owner = handle.trim().toLowerCase();
    const id = identifier.trim();
    const notFound: TemplatePageLookup = {
      kind: 'not_found',
      seo: { ...TEMPLATE_NOT_FOUND_PAGE_TEXT, robots: 'noindex, nofollow' },
    };
    if (!owner || !id) return notFound;

    const libraryTemplate = findPublicTemplateByIdentifier(repoTemplates, id);
    if (libraryTemplate && isTheHandle(resolvePublicTemplateOwnerSlug(libraryTemplate), owner)) {
      return toFoundSeo({
        ...libraryTemplate,
        canonicalPath: buildCanonicalPublicTemplatePath(libraryTemplate),
      });
    }

    try {
      const [env, origin] = await Promise.all([getWorkerEnv(), getRequestOrigin()]);
      const record = await loadPublicTemplate(env, origin, id);
      const ownerHandle = record?.ownerHandle?.trim();
      if (!record || !ownerHandle) return notFound;
      const canonicalPath = buildPublicTemplatePath(ownerHandle, record.slug?.trim() || record.id);
      if (isTheHandle(ownerHandle, owner)) return toFoundSeo({ ...record, canonicalPath });
      return record.isOrganizationTemplate && isTheHandle(record.creatorUsername, owner)
        ? { kind: 'moved', path: canonicalPath }
        : notFound;
    } catch (error) {
      log('error', 'template_page_meta_failed', describeErrorForLog(error));
      return { kind: 'unavailable' };
    }
  },
);
