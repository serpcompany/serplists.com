import { isRecord } from '../../../src/lib/schemas/jsonRecords';
import type { schema } from '../db';

const PUBLIC_TEMPLATE_FIELDS = [
  'id',
  'user_id',
  'owner_type',
  'owner_username',
  'owner_full_name',
  'ownerProfile',
  'owner',
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

const PUBLIC_OWNER_FIELDS = ['type', 'userId', 'teamId', 'publicHandle', 'displayName'] as const;

export type PublicTemplateField = (typeof PUBLIC_TEMPLATE_FIELDS)[number];

function definedFieldsOf<Field extends string>(
  record: Record<string, unknown>,
  fields: readonly Field[],
): Partial<Record<Field, unknown>> {
  const picked: Partial<Record<Field, unknown>> = {};
  for (const field of fields) {
    if (record[field] !== undefined) picked[field] = record[field];
  }
  return picked;
}

export function toPublicTemplate(template: Record<string, unknown>): Partial<Record<PublicTemplateField, unknown>> {
  const { owner, ...publicFields } = definedFieldsOf(template, PUBLIC_TEMPLATE_FIELDS);
  return isRecord(owner) ? { ...publicFields, owner: definedFieldsOf(owner, PUBLIC_OWNER_FIELDS) } : publicFields;
}

export function isOwnPersonalTemplateRow(
  template: Pick<typeof schema.templates.$inferSelect, 'owner_type' | 'team_id' | 'user_id'>,
  userId: string | null,
): boolean {
  return Boolean(userId) && template.owner_type === 'user' && template.user_id === userId && !template.team_id;
}
