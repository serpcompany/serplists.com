import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { portableTemplateRuleSchema } from '../../../src/lib/schemas/checklistSchema';
import { templateOwnerProfile } from '../../../src/lib/schemas/templateOwnerProfile';
import { log } from './logger';
import { normalizeSectionsPayload } from './payloads';
import { normalizeStringArray } from '../../../src/lib/schemas/jsonArrays';
import { withStableTemplateIdentities } from './template-identities';
import { isMissingRulesColumnError } from './template-writes';

export type TemplateDb = ReturnType<typeof createDb>;

type QueryResult<T> = PromiseLike<T> | T;

type TemplateRow = typeof schema.templates.$inferSelect;
export type TemplateRowColumns = Pick<
  TemplateRow,
  'id' | 'items' | 'category' | 'tags' | 'seo_title' | 'seo_description' | 'type'
> & {
  rules?: TemplateRow['rules'] | undefined;
  owner_username?: string | null | undefined;
  owner_full_name?: string | null | undefined;
};

export function getTemplateSelectColumns(includeRules: boolean) {
  const { templates } = schema;

  return {
    id: templates.id,
    user_id: templates.user_id,
    title: templates.title,
    description: templates.description,
    items: templates.items,
    version: templates.version,
    content_version: templates.content_version,
    type: templates.type,
    seo_title: templates.seo_title,
    seo_description: templates.seo_description,
    ...(includeRules ? { rules: templates.rules } : {}),
    owner_type: templates.owner_type,
    team_id: templates.team_id,
    created_by_user_id: templates.created_by_user_id,
    updated_by_user_id: templates.updated_by_user_id,
    is_public: templates.is_public,
    category: templates.category,
    tags: templates.tags,
    slug: templates.slug,
    created_at: templates.created_at,
    updated_at: templates.updated_at,
    deleted_at: templates.deleted_at,
  };
}

export async function withRulesColumnFallback<T>(
  operation: (includeRules: boolean) => QueryResult<T>,
): Promise<T> {
  try {
    return await operation(true);
  } catch (error) {
    if (!isMissingRulesColumnError(error)) {
      throw error;
    }

    return operation(false);
  }
}

export async function findTemplateById(db: TemplateDb, templateId: string) {
  const { templates } = schema;
  const [template] = await withRulesColumnFallback((includeRules) =>
    db.select(getTemplateSelectColumns(includeRules)).from(templates).where(eq(templates.id, templateId)).limit(1),
  );
  return template;
}

export function parseTemplateRow<T extends TemplateRowColumns>(template: T) {
  let sections: unknown[] = [];
  const normalized = normalizeSectionsPayload(template.items);
  if (normalized.error) {
    log('warn', 'template_items_parse_failed', { templateId: template.id });
  } else {
    sections = withStableTemplateIdentities(normalized.sections);
  }

  let rules: unknown[] | undefined;
  if (typeof template.rules === 'string') {
    try {
      const parsedRules: unknown = JSON.parse(template.rules);
      const validatedRules = z.array(portableTemplateRuleSchema).safeParse(parsedRules);
      if (validatedRules.success) {
        rules = validatedRules.data;
      }
    } catch {
      log('warn', 'template_rules_parse_failed', { templateId: template.id });
    }
  }

  const { items: _rawItemsColumn, ...columns } = template;
  return {
    ...columns,
    sections,
    rules,
    categories: normalizeStringArray(template.category),
    tags: normalizeStringArray(template.tags),
    seoTitle: template.seo_title ?? '',
    seoDescription: template.seo_description ?? '',
    type: template.type,
    ownerProfile: templateOwnerProfile(template),
  };
}

export function selectTemplatesWithOwner(env: Env, includeRules = true) {
  const db = createDb(env);
  const { templates, users } = schema;

  return db
    .select({
      ...getTemplateSelectColumns(includeRules),
      owner_username: users.username,
      owner_full_name: users.name,
    })
    .from(templates)
    .leftJoin(users, eq(users.id, templates.user_id));
}
