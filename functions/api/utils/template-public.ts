import type { PublicTemplateOwner, TemplateOwner } from '../../../src/lib/schemas/templateOwner';
import type { schema } from '../db';

const PUBLIC_TEMPLATE_FIELDS = [
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
  'requiredTools',
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

function publicOwnerOf(owner: TemplateOwner): PublicTemplateOwner {
  if (owner.type === 'team') {
    return owner.publicHandle
      ? { type: 'team', publicHandle: owner.publicHandle, displayName: owner.displayName }
      : { type: 'team' };
  }
  return { type: 'user', userId: owner.userId, publicHandle: owner.publicHandle, displayName: owner.displayName };
}

export function toPublicTemplate(
  template: Record<string, unknown> & { owner?: TemplateOwner | undefined },
): Partial<Record<PublicTemplateField, unknown>> & { owner?: PublicTemplateOwner } {
  const publicTemplate: Partial<Record<PublicTemplateField, unknown>> = {};
  for (const field of PUBLIC_TEMPLATE_FIELDS) {
    if (template[field] !== undefined) publicTemplate[field] = template[field];
  }
  return template.owner ? { ...publicTemplate, owner: publicOwnerOf(template.owner) } : publicTemplate;
}

export function isOwnPersonalTemplateRow(
  template: Pick<typeof schema.templates.$inferSelect, 'owner_type' | 'team_id' | 'user_id'>,
  userId: string | null,
): boolean {
  return Boolean(userId) && template.owner_type === 'user' && template.user_id === userId && !template.team_id;
}
