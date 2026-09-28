import { z } from 'zod';

import { parseTemplatesFromData } from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';

export const REPO_TEMPLATE_USER_ID = 'repo-template-catalog';
export const REPO_TEMPLATE_OWNER_NAME = 'SERP Lists Library';
export const REPO_TEMPLATE_OWNER_SLUG = 'serp';
/**
 * Date for repo templates whose pack has no valid `exportedAt`: the day the repo
 * catalog shipped. Never the load time, which would rank starters as newest.
 */
export const REPO_TEMPLATE_FALLBACK_TIMESTAMP = '2026-03-22T00:00:00.000Z';

type RepoTemplateModule = {
  default?: unknown;
};

type RepoTemplateCreatePayload = {
  title: string;
  description?: string;
  type?: 'checklist' | 'recipe';
  seoTitle?: string;
  seoDescription?: string;
  seoUrl?: string;
  rules?: ChecklistTemplate['rules'];
  sections: ChecklistTemplate['sections'];
  isPublic: boolean;
  categories?: string[];
  tags?: string[];
  teamId?: string;
};

const repoTemplateModules = import.meta.glob(
  '../data/public-template-packs/*.json',
  {
    eager: true,
  },
) as Record<string, RepoTemplateModule>;

const getSourceData = (value: unknown): unknown => {
  if (
    value &&
    typeof value === 'object' &&
    'default' in (value as RepoTemplateModule)
  ) {
    return (value as RepoTemplateModule).default;
  }
  return value;
};

const packDateSchema = z.object({ exportedAt: z.string() });

/** A pack's `exportedAt` as an ISO date, or the fixed fallback when it is missing or invalid. */
const resolveRepoPackTimestamp = (sourceData: unknown): string => {
  const parsed = packDateSchema.safeParse(sourceData);
  const time = parsed.success ? Date.parse(parsed.data.exportedAt) : Number.NaN;
  return Number.isFinite(time)
    ? new Date(time).toISOString()
    : REPO_TEMPLATE_FALLBACK_TIMESTAMP;
};

const buildRepoTemplateId = (
  sourcePath: string,
  template: ChecklistTemplate,
  index: number,
): string => {
  const fallbackId =
    sourcePath.split('/').pop()?.replace('.json', '') ||
    `template-${index + 1}`;
  const baseId = template.id?.trim() || template.slug?.trim() || fallbackId;
  return baseId.startsWith('repo:') ? baseId : `repo:${baseId}`;
};

export const normalizeRepoTemplateSources = (
  sources: Record<string, unknown>,
): ChecklistTemplate[] => {
  const templatesByKey = new Map<string, ChecklistTemplate>();

  Object.entries(sources).forEach(([sourcePath, value]) => {
    const sourceData = getSourceData(value);
    // Undated templates take their pack's date, so the Recent sort and published
    // dates stay stable across page loads. Bump `exportedAt` when a pack changes.
    const { templates } = parseTemplatesFromData(sourceData, {
      fallbackTimestamp: resolveRepoPackTimestamp(sourceData),
    });

    templates.forEach((template, index) => {
      const repoTemplate: ChecklistTemplate = {
        ...template,
        id: buildRepoTemplateId(
          sourcePath,
          template as ChecklistTemplate,
          index,
        ),
        isPublic: true,
        userId: REPO_TEMPLATE_USER_ID,
        ownerProfile: {
          full_name: REPO_TEMPLATE_OWNER_NAME,
          username: REPO_TEMPLATE_OWNER_SLUG,
        },
      };

      const key = repoTemplate.slug?.trim() || repoTemplate.id;
      templatesByKey.set(key, repoTemplate);
    });
  });

  return Array.from(templatesByKey.values()).sort((left, right) =>
    left.title.localeCompare(right.title),
  );
};

/** When the repo library started: its earliest template date. */
export const getRepoCatalogCreatedAt = (
  templates: Pick<ChecklistTemplate, 'createdAt'>[],
): string => {
  const times = templates
    .map((template) => Date.parse(template.createdAt))
    .filter(Number.isFinite);
  return times.length > 0
    ? new Date(Math.min(...times)).toISOString()
    : REPO_TEMPLATE_FALLBACK_TIMESTAMP;
};

export const mergePublicTemplateCollections = (
  repoCollection: ChecklistTemplate[],
  apiCollection: ChecklistTemplate[],
): ChecklistTemplate[] => {
  const merged = new Map<string, ChecklistTemplate>();

  [...repoCollection, ...apiCollection].forEach((template) => {
    if (!template.isPublic) return;
    const key = template.slug?.trim() || template.id;
    if (merged.has(key)) return;
    merged.set(key, template);
  });

  return Array.from(merged.values());
};

export const mergeAccountTemplateCollections = (
  publicCollection: ChecklistTemplate[],
  apiCollection: ChecklistTemplate[],
  currentUserId?: string,
): ChecklistTemplate[] => {
  if (!currentUserId) return publicCollection;

  const ownedTemplates = apiCollection.filter(
    (template) => template.userId === currentUserId,
  );
  // The catalog can be up to 5 minutes old (edge cache), so the user's own copy wins;
  // Map.set keeps each template's original position.
  const merged = new Map(publicCollection.map((template) => [template.id, template]));
  ownedTemplates.forEach((template) => merged.set(template.id, template));

  return Array.from(merged.values());
};

export const findPublicTemplateByIdentifier = (
  templates: ChecklistTemplate[],
  identifier: string,
): ChecklistTemplate | undefined => {
  return templates.find(
    (template) =>
      template.isPublic &&
      (template.slug === identifier || template.id === identifier),
  );
};

export const isRepoTemplate = (
  template: Pick<ChecklistTemplate, 'id' | 'userId'> | null | undefined,
): boolean => {
  if (!template) return false;
  return (
    template.userId === REPO_TEMPLATE_USER_ID || template.id.startsWith('repo:')
  );
};

// teamId is required so every caller decides the ownership context: undefined
// means Personal, an id means that Organization.
export const buildRepoTemplateCreatePayload = (
  template: ChecklistTemplate,
  teamId: string | undefined,
): RepoTemplateCreatePayload => ({
  title: template.title,
  description: template.description || '',
  type: template.type,
  seoTitle: template.seoTitle || '',
  seoDescription: template.seoDescription || '',
  rules: template.rules,
  seoUrl: template.slug,
  sections: template.sections,
  isPublic: false,
  categories: template.categories || [],
  tags: template.tags || [],
  teamId,
});

export const repoTemplates = normalizeRepoTemplateSources(repoTemplateModules);
