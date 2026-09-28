// What a public template response may carry. A stored template also records which
// Organization owns it and who created and last edited it. Public responses (the
// edge-cached catalog, Public Profiles, and slug or id reads by anyone but the owner or an
// Organization member) leave those out, so collecting them cannot name an Organization's
// members. The creator stays visible on purpose: user_id and the owner_* fields attribute
// the template. Add a field here only when visitors need it.
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

/** Copies only the allowlisted fields of a parsed template row, never a spread of the row. */
export function toPublicTemplate(template: Record<string, unknown>): Partial<Record<PublicTemplateField, unknown>> {
  const publicTemplate: Partial<Record<PublicTemplateField, unknown>> = {};
  for (const field of PUBLIC_TEMPLATE_FIELDS) {
    if (template[field] !== undefined) publicTemplate[field] = template[field];
  }
  return publicTemplate;
}

/** True for a row the signed-in user owns as a Personal template. */
export function isOwnPersonalTemplateRow(template: Record<string, unknown>, userId: string | null): boolean {
  return Boolean(userId) && template.owner_type === 'user' && template.user_id === userId && !template.team_id;
}
