import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { insertRowWhere, rowExistsSql } from './guarded-insert';
import { jsonError } from './response';

// Template inserts and the template-count limit. Create, clone and restore pre-check the
// count for a clear error, then repeat the check inside the write so concurrent requests
// cannot all pass the same count.

type Db = ReturnType<typeof createDb>;
export type TemplateInsertValues = typeof schema.templates.$inferInsert;
type AuditEventValues = typeof schema.audit_events.$inferInsert;
type TemplateVersionValues = typeof schema.template_versions.$inferInsert;

/** The context whose template limit a template counts toward. */
export type TemplateOwnerContext = { userId: string; teamId: string | null };
export type TemplateCapacity = { owner: TemplateOwnerContext; limit: number };

export function isMissingRulesColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /templates[".]?\.?"?rules|no such column:.*rules/i.test(message);
}

export function omitRulesColumn<T extends Record<string, unknown>>(values: T): Omit<T, 'rules'> {
  const { rules: _rules, ...rest } = values;
  return rest;
}

/** The active templates that count toward a context's template limit. */
export function templatesInContext(owner: TemplateOwnerContext): SQL {
  const { templates } = schema;
  return (owner.teamId
    ? and(eq(templates.owner_type, 'team'), eq(templates.team_id, owner.teamId), isNull(templates.deleted_at))
    : and(eq(templates.owner_type, 'user'), eq(templates.user_id, owner.userId), isNull(templates.team_id), isNull(templates.deleted_at))) as SQL;
}

export async function countTemplates(env: Env, owner: TemplateOwnerContext): Promise<number> {
  const [row] = await createDb(env)
    .select({ count: sql<number>`count(*)` })
    .from(schema.templates)
    .where(templatesInContext(owner))
    .limit(1);
  return row?.count ?? 0;
}

/** True while the context has fewer than `limit` templates, evaluated inside a write. */
export function templateCapacityAvailableSql({ owner, limit }: TemplateCapacity): SQL {
  return sql`(select count(*) from ${schema.templates} where ${templatesInContext(owner)}) < ${limit}`;
}

export function templateLimitResponse(message: string, limit: number, current: number): Response {
  return jsonError(message, 403, {
    code: 'limit_reached',
    details: { limit, current, resource: 'templates' },
  });
}

/**
 * Inserts a template with its first version and audit row in one batch. With `capacity`, the
 * template is inserted only while its context is below the limit, and the version and audit
 * rows only if it was. Returns false when the limit stopped the insert.
 */
export async function insertTemplateWithHistoryFallback(
  db: Db,
  values: TemplateInsertValues,
  versionValues: TemplateVersionValues,
  auditEventValues: AuditEventValues,
  capacity?: TemplateCapacity,
): Promise<boolean> {
  const { audit_events, template_versions, templates } = schema;
  const templateId = String(values.id);

  const runBatch = (templateValues: TemplateInsertValues) => capacity
    ? db.batch([
        insertRowWhere(db, templates, templateValues, templateCapacityAvailableSql(capacity)),
        insertRowWhere(db, template_versions, versionValues, rowExistsSql(templates.id, templateId)),
        insertRowWhere(db, audit_events, auditEventValues, rowExistsSql(templates.id, templateId)),
      ])
    : db.batch([
        db.insert(templates).values(templateValues),
        db.insert(template_versions).values(versionValues),
        db.insert(audit_events).values(auditEventValues),
      ]);

  let results: unknown[];
  try {
    results = await runBatch(values);
  } catch (error) {
    if (!isMissingRulesColumnError(error)) {
      throw error;
    }

    results = await runBatch(omitRulesColumn(values as Record<string, unknown>) as TemplateInsertValues);
  }

  const meta = (results[0] as { meta?: { changes?: unknown } } | undefined)?.meta;
  return !(capacity && meta?.changes === 0);
}
