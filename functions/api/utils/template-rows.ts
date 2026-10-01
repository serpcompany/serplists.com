import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { portableTemplateRuleSchema } from '../../../src/lib/schemas/checklistSchema';
import { log } from './logger';
import { normalizeSectionsPayload, normalizeStringArray } from './payloads';
import { withStableTemplateIdentities } from './template-identities';
import { isMissingRulesColumnError } from './template-writes';

export type TemplateDb = ReturnType<typeof createDb>;

type QueryResult<T> = PromiseLike<T> | T;

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

export function parseTemplateRow<T extends Record<string, unknown>>(template: T) {
  let sections: unknown[] = [];
  if (typeof template.items !== 'undefined') {
    const normalized = normalizeSectionsPayload(template.items);
    if (normalized.error) {
      log('warn', 'template_items_parse_failed', { templateId: template.id });
    } else {
      sections = withStableTemplateIdentities(normalized.sections);
    }
  }

  let rules: unknown[] | undefined;
  if (typeof template.rules !== 'undefined' && template.rules !== null) {
    try {
      const parsedRules = typeof template.rules === 'string' ? JSON.parse(template.rules) : template.rules;
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
    seoTitle: typeof template.seo_title === 'string' ? template.seo_title : '',
    seoDescription: typeof template.seo_description === 'string' ? template.seo_description : '',
    type: typeof template.type === 'string' ? template.type : 'checklist',
    ownerProfile:
      typeof template.owner_username === 'string' || typeof template.owner_full_name === 'string'
        ? {
            username: typeof template.owner_username === 'string' ? template.owner_username : undefined,
            full_name: typeof template.owner_full_name === 'string' ? template.owner_full_name : undefined,
          }
        : undefined,
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
