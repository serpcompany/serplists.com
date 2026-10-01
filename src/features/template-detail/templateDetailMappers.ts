import { resolvePublicTemplateOwnerSlug } from '@/lib/routes';
import { resolveTemplateDestinationTeamId } from '@/lib/templateDestination';
import { readApiTemplateTeamId } from '@/lib/templates/apiTemplateOwner';
import { buildDuplicateTemplateTitle } from '@/lib/templates/duplicateTemplateTitle';
import {
  isSectionsShape,
  normalizeSections as normalizeChecklistSections,
} from '@/lib/utils/checklistSections';
import type { PublicProfile } from '@/lib/schemas/accountResponses';
import type { ApiTemplate } from '@/lib/schemas/apiTemplates';
import type { ChecklistSection, ChecklistTemplate } from '@/types/checklist';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;

const normalizeTemplateSections = (rawTemplate: ApiTemplate): ChecklistSection[] => {
  if (Array.isArray(rawTemplate.sections)) {
    return normalizeChecklistSections(rawTemplate.sections);
  }

  if (!('items' in rawTemplate)) {
    return [];
  }

  try {
    const rawItems: unknown =
      typeof rawTemplate.items === 'string'
        ? JSON.parse(rawTemplate.items)
        : rawTemplate.items;

    if (!Array.isArray(rawItems)) {
      return [];
    }

    if (isSectionsShape(rawItems)) {
      return normalizeChecklistSections(rawItems);
    }

    return normalizeChecklistSections([
      {
        id: '1',
        title: 'Checklist',
        items: rawItems,
      },
    ]);
  } catch {
    return [];
  }
};

export const mapApiTemplateToChecklistTemplate = (
  foundTemplate: ApiTemplate,
  fallbackSlug: string,
): ChecklistTemplate => {
  const categories =
    asStringArray(foundTemplate.categories) ??
    (typeof foundTemplate.category === 'string' && foundTemplate.category
      ? [foundTemplate.category]
      : []);

  return {
    id: String(foundTemplate.id || ''),
    title: String(foundTemplate.title || 'Template'),
    description: asString(foundTemplate.description) ?? '',
    type:
      foundTemplate.type === 'recipe' || foundTemplate.type === 'checklist'
        ? foundTemplate.type
        : 'checklist',
    seoTitle: asString(foundTemplate.seoTitle) ?? '',
    seoDescription: asString(foundTemplate.seoDescription) ?? '',
    seoUrl: asString(foundTemplate.seoUrl),
    rules: foundTemplate.rules ?? undefined,
    sections: normalizeTemplateSections(foundTemplate),
    categories,
    tags: asStringArray(foundTemplate.tags) ?? [],
    userId: String(foundTemplate.user_id || ''),
    teamId: readApiTemplateTeamId(foundTemplate),
    createdAt: String(foundTemplate.created_at || ''),
    updatedAt: String(foundTemplate.updated_at || foundTemplate.created_at || ''),
    isPublic: Boolean(foundTemplate.is_public),
    slug: asString(foundTemplate.slug) ?? fallbackSlug,
    version: typeof foundTemplate.version === 'number' ? foundTemplate.version : 1,
    ownerType:
      foundTemplate.owner_type === 'team' || foundTemplate.owner_type === 'user'
        ? foundTemplate.owner_type
        : undefined,
    ownerProfile:
      typeof foundTemplate.owner_username === 'string' ||
      typeof foundTemplate.owner_full_name === 'string'
        ? {
            username: asString(foundTemplate.owner_username),
            full_name: asString(foundTemplate.owner_full_name),
          }
        : undefined,
  };
};

export const resolveTemplateOwnerProfile = (
  template: ChecklistTemplate,
  profile?: Pick<PublicProfile, 'username' | 'full_name'> | null,
): {
  ownerSlug: string | null;
  template: ChecklistTemplate;
} => {
  const nextTemplate =
    profile &&
    (typeof profile.username === 'string' ||
      typeof profile.full_name === 'string')
      ? {
          ...template,
          ownerProfile: {
            ...template.ownerProfile,
            username: asString(profile.username) ?? template.ownerProfile?.username,
            full_name: asString(profile.full_name) ?? template.ownerProfile?.full_name,
          },
        }
      : template;

  return {
    ownerSlug: resolvePublicTemplateOwnerSlug(nextTemplate),
    template: nextTemplate,
  };
};

export const buildTemplateCopyPayload = (
  template: ChecklistTemplate,
  activeTeamId: string | undefined,
): Omit<ChecklistTemplate, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'slug'> => ({
  categories: template.categories ?? [],
  description: template.description,
  isPublic: template.isPublic,
  rules: template.rules,
  sections: template.sections,
  seoDescription: template.seoDescription,
  seoTitle: template.seoTitle,
  seoUrl: '',
  tags: template.tags ?? [],
  teamId: resolveTemplateDestinationTeamId(template, activeTeamId),
  title: buildDuplicateTemplateTitle(template.title),
  type: template.type ?? 'checklist',
});
