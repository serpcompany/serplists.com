import { z } from 'zod';

import { templatePackModules } from '@/data/public-template-packs';
import { parseTemplatesFromData } from '@/lib/utils/templateBackup';
import type { ChecklistTemplate } from '@/types/checklist';

export const REPO_TEMPLATE_USER_ID = 'repo-template-catalog';
export const REPO_TEMPLATE_OWNER_NAME = 'SERP Lists Library';
export const REPO_TEMPLATE_OWNER_SLUG = 'serp';
export const REPO_TEMPLATE_FALLBACK_TIMESTAMP = '2026-03-22T00:00:00.000Z';

type RepoTemplateModule = {
  default?: unknown;
};

type RepoTemplateCreatePayload = {
  title: string;
  description?: string;
  type?: 'checklist' | 'recipe' | undefined;
  seoTitle?: string;
  seoDescription?: string;
  seoUrl?: string;
  rules?: ChecklistTemplate['rules'];
  sections: ChecklistTemplate['sections'];
  isPublic: boolean;
  categories?: string[];
  tags?: string[];
  teamId?: string | undefined;
};

const repoTemplateModules = templatePackModules as Record<string, RepoTemplateModule>;

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
    const { templates } = parseTemplatesFromData(sourceData, {
      timestampForUndatedTemplates: resolveRepoPackTimestamp(sourceData),
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

export const mergeAccountTemplateCollections = (
  publicCollection: ChecklistTemplate[],
  loadedPersonalList: ChecklistTemplate[] | undefined,
  currentUserId?: string,
): ChecklistTemplate[] => {
  if (!currentUserId || !loadedPersonalList) return publicCollection;

  const ownedTemplates = loadedPersonalList.filter(
    (template) => template.userId === currentUserId,
  );
  const ownedIds = new Set(ownedTemplates.map((template) => template.id));
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

export const buildRepoTemplateCreatePayload = (
  template: ChecklistTemplate,
  destinationTeamIdOrPersonal: string | undefined,
): RepoTemplateCreatePayload => ({
  title: template.title,
  description: template.description || '',
  type: template.type,
  seoTitle: template.seoTitle || '',
  seoDescription: template.seoDescription || '',
  rules: template.rules,
  sections: template.sections,
  isPublic: false,
  categories: template.categories || [],
  tags: template.tags || [],
  teamId: destinationTeamIdOrPersonal,
});

export const repoTemplates = normalizeRepoTemplateSources(repoTemplateModules);
