import { and, eq, ne } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { json, jsonError } from './response';
import { isReservedTemplateSlug } from './reserved-template-slugs';
import { generateSlug, truncateSlug, withSlugSuffix } from './slug';
import { TEMPLATE_SLUG_MAX } from '../../../src/lib/schemas/templateLimits';
import {
  countTemplates,
  insertTemplateWithHistoryFallback,
  templateLimitResponse,
  type AuditEventValues,
  type TemplateCapacity,
  type TemplateInsertValues,
  type TemplateVersionValues,
} from './template-writes';

type Db = ReturnType<typeof createDb>;

export const TEMPLATE_SLUG_ATTEMPTS = 3;

export function isTemplateSlugUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const message = current instanceof Error ? current.message : String(current);
    if (/unique constraint failed:[^\n]*\btemplates\.slug\b/i.test(message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export function templateSlugBase(title: string): string {
  return truncateSlug(generateSlug(title || 'template'), TEMPLATE_SLUG_MAX) || 'template';
}

const randomSlugSuffix = () => crypto.randomUUID().slice(0, 8);

async function isTemplateSlugTaken(db: Db, slug: string, exceptTemplateId?: string): Promise<boolean> {
  if (isReservedTemplateSlug(slug)) return true;
  const { templates } = schema;
  const [row] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(exceptTemplateId ? and(eq(templates.slug, slug), ne(templates.id, exceptTemplateId)) : eq(templates.slug, slug))
    .limit(1);
  return Boolean(row);
}

export async function generateUniqueSlug(env: Env, title: string, templateId: string): Promise<string> {
  const db = createDb(env);
  const base = templateSlugBase(title);
  if (!(await isTemplateSlugTaken(db, base))) return base;

  const suffixed = withSlugSuffix(base, templateId.slice(0, 8), TEMPLATE_SLUG_MAX);
  if (!(await isTemplateSlugTaken(db, suffixed))) return suffixed;

  return withSlugSuffix(base, randomSlugSuffix(), TEMPLATE_SLUG_MAX);
}

export async function findFreeSuffixedSlug(db: Db, slug: string, templateId: string): Promise<string | null> {
  for (const suffix of [templateId.slice(0, 8), randomSlugSuffix()]) {
    const candidate = withSlugSuffix(slug, suffix, TEMPLATE_SLUG_MAX);
    if (!(await isTemplateSlugTaken(db, candidate, templateId))) return candidate;
  }
  return null;
}

export function templateSlugTakenResponse(): Response {
  return jsonError('Could not reserve a URL for this template. Try again.', 409, { code: 'slug_taken' });
}

export type NewTemplateRows = {
  template: TemplateInsertValues;
  version: TemplateVersionValues;
  audit: AuditEventValues;
};

export type NewTemplateInsertResult = { slug: string } | { failed: 'slug_taken' | 'limit_reached' };

export async function insertTemplateWithUniqueSlug(
  db: Db,
  params: {
    title: string;
    slug: string;
    buildRows: (slug: string) => Promise<NewTemplateRows>;
    capacity?: TemplateCapacity;
  },
): Promise<NewTemplateInsertResult> {
  let slug = params.slug;
  for (let attempt = 1; attempt <= TEMPLATE_SLUG_ATTEMPTS; attempt += 1) {
    const rows = await params.buildRows(slug);
    try {
      const inserted = await insertTemplateWithHistoryFallback(db, rows.template, rows.version, rows.audit, params.capacity);
      return inserted ? { slug } : { failed: 'limit_reached' };
    } catch (error) {
      if (!isTemplateSlugUniqueViolation(error)) throw error;
    }
    slug = withSlugSuffix(templateSlugBase(params.title), randomSlugSuffix(), TEMPLATE_SLUG_MAX);
  }
  return { failed: 'slug_taken' };
}

export async function newTemplateResponse(
  env: Env,
  templateId: string,
  result: NewTemplateInsertResult,
  capacity: TemplateCapacity | undefined,
  action: 'create' | 'save',
): Promise<Response> {
  if ('slug' in result) return json({ id: templateId, slug: result.slug });
  if (result.failed === 'limit_reached' && capacity) {
    return templateLimitResponse(capacity.owner, action, capacity.limit, await countTemplates(env, capacity.owner));
  }
  return templateSlugTakenResponse();
}
