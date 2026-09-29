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

// The category pages count the public catalog in the browser. Their <head> needs the same
// counts, so the server reads the same catalog (GET /api/templates?scope=public, which the
// API serves from the edge cache) and counts it with the same functions. The small result is
// cached for 5 minutes, so a category page parses the catalog once per 5 minutes per data
// center.
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
      // A row the library could not read is skipped there too.
      return [];
    }
  });

// The library's category list (useTemplateLibrary and CategoryDetail): the bundled library and
// the catalog, public templates with a public URL, the predefined categories and every
// template category.
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

/** Every category with a public template, as the category pages list them, or null on failure. */
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

/**
 * What /categories/<slug> says in its <head>, or null when the server cannot name the
 * category: one only database templates use, and the catalog could not be read, or one that
 * does not exist. The page then keeps the site's defaults and decides in the browser, as it
 * always has: a missing category shows the 404 page with noindex, an old slug moves to the
 * current one. A registry category no public template uses yet is kept out of search.
 */
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
