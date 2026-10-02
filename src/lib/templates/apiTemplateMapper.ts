import type { ApiTemplate } from '@/lib/schemas/apiTemplates';
import { templateOwnerProfile } from '@/lib/schemas/templateOwnerProfile';
import { readApiTemplateTeamId } from '@/lib/templates/apiTemplateOwner';
import { normalizeSections } from '@/lib/utils/checklistSections';
import type { ChecklistTemplate } from '@/types/checklist';

const optionalString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

const parseJsonField = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);

const isSectionRecord = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && 'items' in value && Boolean(value.items);

const startsWithASection = (value: unknown): boolean =>
  Array.isArray(value) && isSectionRecord(value[0]);

const parsedTags = (tags: string): string[] => {
  const parsed: unknown = JSON.parse(tags);
  return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
};

const templateSections = (template: ApiTemplate): unknown => {
  if (template.sections) return template.sections;
  if (!template.items) return [];
  const parsedItems = parseJsonField(template.items);
  if (startsWithASection(parsedItems)) {
    return parsedItems;
  }
  return [{ id: '1', title: 'Checklist', items: parsedItems }];
};

export const mapApiTemplate = (template: ApiTemplate): ChecklistTemplate => ({
  id: String(template.id),
  title: String(template.title || ''),
  description: optionalString(template.description) ?? '',
  type: template.type === 'recipe' ? 'recipe' : 'checklist',
  seoTitle: optionalString(template.seoTitle) ?? '',
  seoDescription: optionalString(template.seoDescription) ?? '',
  rules: template.rules ?? undefined,
  seoUrl: optionalString(template.slug) ?? '',
  sections: normalizeSections(templateSections(template)),
  categories: template.categories ?? (template.category ? [template.category] : []),
  tags: typeof template.tags === 'string' ? parsedTags(template.tags) : (template.tags ?? []),
  userId: optionalString(template.user_id) ?? '',
  createdAt: optionalString(template.created_at) ?? '',
  updatedAt: String(template.updated_at || template.created_at || ''),
  isPublic: Boolean(template.is_public),
  slug: optionalString(template.slug) ?? '',
  version: typeof template.version === 'number' ? template.version : 1,
  teamId: readApiTemplateTeamId(template),
  ownerType: template.owner_type === 'team' || template.owner_type === 'user' ? template.owner_type : undefined,
  ownerProfile: templateOwnerProfile(template),
});
