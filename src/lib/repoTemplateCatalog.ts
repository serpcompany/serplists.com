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

// The profile that owns a public template's URL: its owner's username, or the SERP library for
// bundled starters. Null when the owner is unknown.
export const resolvePublicTemplateOwnerSlug = (
  template: Pick<ChecklistTemplate, 'id' | 'userId' | 'ownerProfile'>,
): string | null => {
  const username = template.ownerProfile?.username?.trim();

  if (username) {
    return username;
  }

  if (
    template.userId === REPO_TEMPLATE_USER_ID ||
    template.id.startsWith('repo:')
  ) {
    return REPO_TEMPLATE_OWNER_SLUG;
  }

  return null;
};

// Public URLs are /profile/<owner>/<slug>, so two templates are the same catalog entry only when
// both owner and slug match (an official SERP copy of a bundled starter). A template with an
// unknown owner is never merged with another one.
const publicCatalogKey = (template: ChecklistTemplate): string => {
  const ownerSlug = resolvePublicTemplateOwnerSlug(template);
  if (!ownerSlug) return `id:${template.id}`;
  return `${ownerSlug.toLowerCase()}/${template.slug?.trim() || template.id}`;
};

export const mergePublicTemplateCollections = (
  repoCollection: ChecklistTemplate[],
  apiCollection: ChecklistTemplate[],
): ChecklistTemplate[] => {
  const merged = new Map<string, ChecklistTemplate>();

  [...repoCollection, ...apiCollection].forEach((template) => {
    if (!template.isPublic) return;
    const key = publicCatalogKey(template);
    if (merged.has(key)) return;
    merged.set(key, template);
  });

  return Array.from(merged.values());
};

// `apiCollection` is the user's own Personal list, or undefined until it has loaded.
export const mergeAccountTemplateCollections = (
  publicCollection: ChecklistTemplate[],
  apiCollection: ChecklistTemplate[] | undefined,
  currentUserId?: string,
): ChecklistTemplate[] => {
  if (!currentUserId || !apiCollection) return publicCollection;

  const ownedTemplates = apiCollection.filter(
    (template) => template.userId === currentUserId,
  );
  const ownedIds = new Set(ownedTemplates.map((template) => template.id));
  // The catalog can be up to 5 minutes old (edge cache), so the loaded Personal list is the
  // source of truth for the user's own Personal templates: a catalog copy missing from it was
  // deleted, made private, or moved to an Organization. The user's own copy wins, and Map.set
  // keeps each template's original position.
  const merged = new Map(
    publicCollection
      .filter(
        (template) =>
          template.userId !== currentUserId ||
          Boolean(template.teamId) ||
          isRepoTemplate(template) ||
          ownedIds.has(template.id),
      )
      .map((template) => [template.id, template]),
  );
  ownedTemplates.forEach((template) => merged.set(template.id, template));

  return Array.from(merged.values());
};

// With ownerUsername (a /profile/<owner>/<slug> page), only that owner's template matches, since
// different owners can publish templates with the same slug.
export const findPublicTemplateByIdentifier = (
  templates: ChecklistTemplate[],
  identifier: string,
  ownerUsername?: string,
): ChecklistTemplate | undefined => {
  const owner = ownerUsername?.trim().toLowerCase();
  return templates.find(
    (template) =>
      template.isPublic &&
      (template.slug === identifier || template.id === identifier) &&
      (!owner || resolvePublicTemplateOwnerSlug(template)?.toLowerCase() === owner),
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
  // No seoUrl: the starter keeps its slug, and the copy gets one from its title.
  sections: template.sections,
  isPublic: false,
  categories: template.categories || [],
  tags: template.tags || [],
  teamId,
});

export const repoTemplates = normalizeRepoTemplateSources(repoTemplateModules);
