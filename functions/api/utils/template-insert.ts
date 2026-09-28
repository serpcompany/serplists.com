import { and, eq, ne } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { jsonError } from './response';
import { generateSlug, truncateSlug, withSlugSuffix } from './slug';
import { TEMPLATE_SLUG_MAX } from '../../../src/lib/schemas/templateLimits';

// Writing new templates, and choosing their slugs. A slug is picked by reading first, so a
// concurrent write can claim it before this request's batch runs; the unique index
// (idx_templates_slug_unique) then rejects the batch, which D1 rolls back as a whole.

type Db = ReturnType<typeof createDb>;
export type TemplateInsertValues = typeof schema.templates.$inferInsert;
export type AuditEventValues = typeof schema.audit_events.$inferInsert;
export type TemplateVersionValues = typeof schema.template_versions.$inferInsert;

/** New templates try this many slugs before giving up with 409 slug_taken. */
export const TEMPLATE_SLUG_ATTEMPTS = 3;

export function isMissingRulesColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /templates[".]?\.?"?rules|no such column:.*rules/i.test(message);
}

export function omitRulesColumn<T extends Record<string, unknown>>(values: T): Omit<T, 'rules'> {
  const { rules: _rules, ...rest } = values;
  return rest;
}

/** True when the error (or one it wraps) is the unique index on templates.slug. */
export function isTemplateSlugUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const message = current instanceof Error ? current.message : String(current);
    if (/unique constraint failed:[^\n]*\btemplates\.slug\b/i.test(message)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

/** The slug a title asks for, before any suffix: 'template' when nothing usable is left. */
export function templateSlugBase(title: string): string {
  return truncateSlug(generateSlug(title || 'template'), TEMPLATE_SLUG_MAX) || 'template';
}

const randomSlugSuffix = () => crypto.randomUUID().slice(0, 8);

async function isTemplateSlugTaken(db: Db, slug: string, exceptTemplateId?: string): Promise<boolean> {
  const { templates } = schema;
  const [row] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(exceptTemplateId ? and(eq(templates.slug, slug), ne(templates.id, exceptTemplateId)) : eq(templates.slug, slug))
    .limit(1);
  return Boolean(row);
}

/** A slug for a new template: the clean one if free, else a deterministic, then a random suffix. */
export async function generateUniqueSlug(env: Env, title: string, templateId: string): Promise<string> {
  const db = createDb(env);
  const base = templateSlugBase(title);
  if (!(await isTemplateSlugTaken(db, base))) return base;

  const suffixed = withSlugSuffix(base, templateId.slice(0, 8), TEMPLATE_SLUG_MAX);
  if (!(await isTemplateSlugTaken(db, suffixed))) return suffixed;

  // Extremely unlikely collision; the insert retries if this one is taken too.
  return withSlugSuffix(base, randomSlugSuffix(), TEMPLATE_SLUG_MAX);
}

/**
 * A free slug for an existing template whose requested slug is taken by another one: the
 * id suffix, then a random one, each checked. Null when both are taken.
 */
export async function findFreeSuffixedSlug(db: Db, slug: string, templateId: string): Promise<string | null> {
  for (const suffix of [templateId.slice(0, 8), randomSlugSuffix()]) {
    const candidate = withSlugSuffix(slug, suffix, TEMPLATE_SLUG_MAX);
    if (!(await isTemplateSlugTaken(db, candidate, templateId))) return candidate;
  }
  return null;
}

async function insertTemplateWithHistoryFallback(
  db: Db,
  values: TemplateInsertValues,
  versionValues: TemplateVersionValues,
  auditEventValues: AuditEventValues,
): Promise<void> {
  const { audit_events, template_versions, templates } = schema;

  const runBatch = (templateValues: TemplateInsertValues) =>
    db.batch([
      db.insert(templates).values(templateValues),
      db.insert(template_versions).values(versionValues),
      db.insert(audit_events).values(auditEventValues),
    ]);

  try {
    await runBatch(values);
  } catch (error) {
    if (!isMissingRulesColumnError(error)) {
      throw error;
    }

    await runBatch(omitRulesColumn(values as Record<string, unknown>) as TemplateInsertValues);
  }
}

/** A new template could not get a free slug in TEMPLATE_SLUG_ATTEMPTS tries. */
export function templateSlugTakenResponse(): Response {
  return jsonError('Could not reserve a URL for this template. Try again.', 409, { code: 'slug_taken' });
}

export type NewTemplateRows = {
  template: TemplateInsertValues;
  version: TemplateVersionValues;
  audit: AuditEventValues;
};

/**
 * Inserts a new template with its first version and audit event. When a concurrent write
 * claimed the slug, the rows are rebuilt with a random suffix (the version snapshot and the
 * audit event carry the slug too) and the batch retried. Returns the slug written, or null
 * when every attempt collided. Other errors are thrown unchanged.
 */
export async function insertTemplateWithUniqueSlug(
  db: Db,
  params: { title: string; slug: string; buildRows: (slug: string) => Promise<NewTemplateRows> },
): Promise<string | null> {
  let slug = params.slug;
  for (let attempt = 1; attempt <= TEMPLATE_SLUG_ATTEMPTS; attempt += 1) {
    const rows = await params.buildRows(slug);
    try {
      await insertTemplateWithHistoryFallback(db, rows.template, rows.version, rows.audit);
      return slug;
    } catch (error) {
      if (!isTemplateSlugUniqueViolation(error)) throw error;
    }
    slug = withSlugSuffix(templateSlugBase(params.title), randomSlugSuffix(), TEMPLATE_SLUG_MAX);
  }
  return null;
}
