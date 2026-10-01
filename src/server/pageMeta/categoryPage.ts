import 'server-only';

import { cache } from 'react';
import { z } from 'zod';

import { describeErrorForLog, log } from '@functions/api/utils/logger';
import { withEdgeCache } from '@functions/api/utils/edge-cache';
import { resolveCategoryPresentation } from '@/components/checklist-library/categoryPresentation';
import {
  buildDiscoveryCategories,
  type DiscoveryCategory,
} from '@/components/checklist-library/discovery-utils';
import { mapApiTemplate } from '@/contexts/templateListFetchers';
import { buildCategoryPageTitle, describeCategoryPage } from '@/lib/publicPageMeta';
import { mergePublicTemplateCollections, repoTemplates } from '@/lib/repoTemplateCatalog';
import {
  buildCategorySlug,
  buildPublicCategoryPathForSlug,
  hasCanonicalPublicTemplatePath,
} from '@/lib/routes';
import type { PageSeo } from '@/lib/seo/pageMetadata';
import type { ChecklistTemplate } from '@/types/checklist';
import { getPredefinedCategories } from '@/utils/categories';

import { fetchApi } from '../api';
import { getRequestOrigin } from '../cloudflare';

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_KEY = '/__page-meta/v1/categories';

const summarySchema = z.array(z.object({ slug: z.string(), name: z.string(), count: z.number() }));

const toTemplates = (rows: unknown): ChecklistTemplate[] =>
  (Array.isArray(rows) ? rows : []).flatMap((row) => {
    try {
      return typeof row === 'object' && row !== null
        ? [mapApiTemplate(row as Record<string, unknown>)]
        : [];
    } catch {
      return [];
    }
  });

const buildCategorySummary = async (): Promise<Response> => {
  const catalog = await fetchApi('/api/templates?scope=public');
  if (!catalog.ok) return new Response(null, { status: 503 });
  const templates = mergePublicTemplateCollections(repoTemplates, toTemplates(await catalog.json())).filter(
    (template) => template.isPublic === true && hasCanonicalPublicTemplatePath(template),
  );
  const categoryNames = new Set<string>(getPredefinedCategories());
  templates.forEach((template) => template.categories?.forEach((name) => categoryNames.add(name)));
  return Response.json(buildDiscoveryCategories(templates, Array.from(categoryNames).sort()));
};

export const loadCategorySummary = cache(async (): Promise<DiscoveryCategory[] | null> => {
  try {
    const origin = await getRequestOrigin();
    const response = await withEdgeCache(new Request(origin), CACHE_KEY, CACHE_TTL_SECONDS, buildCategorySummary);
    return response.ok ? summarySchema.parse(await response.json()) : null;
  } catch (error) {
    log('error', 'category_page_meta_failed', describeErrorForLog(error));
    return null;
  }
});

export const loadCategoryPageSeo = cache(async (rawSlug: string): Promise<PageSeo | null> => {
  const slug = buildCategorySlug(rawSlug);
  if (!slug) return null;

  const summary = await loadCategorySummary();
  const stats = summary?.find((category) => category.slug === slug);
  const category = resolveCategoryPresentation(slug, stats);
  if (!category) return null;

  const templateCount = summary ? (stats?.count ?? 0) : null;
  return {
    title: buildCategoryPageTitle(category.name),
    description: describeCategoryPage(category, templateCount),
    keywords: [category.name, 'checklist templates', 'workflow templates'],
    path: buildPublicCategoryPathForSlug(slug),
    ...(templateCount === 0 ? { robots: 'noindex, follow' } : {}),
  };
});
