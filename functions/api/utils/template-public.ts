import type { schema } from '../db';

export const PUBLIC_TEMPLATE_FIELDS = [
  'id',
  'user_id',
  'owner_type',
  'owner_username',
  'owner_full_name',
  'ownerProfile',
  'title',
  'description',
  'type',
  'sections',
  'rules',
  'categories',
  'tags',
  'seoTitle',
  'seoDescription',
  'slug',
  'is_public',
  'version',
  'created_at',
  'updated_at',
] as const;

export type PublicTemplateField = (typeof PUBLIC_TEMPLATE_FIELDS)[number];

export function toPublicTemplate(template: Record<string, unknown>): Partial<Record<PublicTemplateField, unknown>> {
  const publicTemplate: Partial<Record<PublicTemplateField, unknown>> = {};
  for (const field of PUBLIC_TEMPLATE_FIELDS) {
    if (template[field] !== undefined) publicTemplate[field] = template[field];
  }
  return publicTemplate;
}

export function isOwnPersonalTemplateRow(
  template: Pick<typeof schema.templates.$inferSelect, 'owner_type' | 'team_id' | 'user_id'>,
  userId: string | null,
): boolean {
  return Boolean(userId) && template.owner_type === 'user' && template.user_id === userId && !template.team_id;
}
