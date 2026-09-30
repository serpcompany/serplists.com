import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { insertAuditEventWhen } from './audit';
import { batchUpdateMissed } from './checklist-runs';
import { insertRowWhere, rowExistsSql, withoutColumns } from './guarded-insert';
import { limitReachedResponse } from './limit-reached';

// Template inserts, the template-count limit, and the guarded batch a template edit writes.
// Create, clone and restore pre-check the count for a clear error, then repeat the check
// inside the write so concurrent requests cannot all pass the same count.

type Db = ReturnType<typeof createDb>;
export type TemplateInsertValues = typeof schema.templates.$inferInsert;
export type TemplateUpdateValues = Partial<TemplateInsertValues>;
export type AuditEventValues = typeof schema.audit_events.$inferInsert;
export type TemplateVersionValues = typeof schema.template_versions.$inferInsert;

/** The context whose template limit a template counts toward. */
export type TemplateOwnerContext = { userId: string; teamId: string | null };
export type TemplateCapacity = { owner: TemplateOwnerContext; limit: number };

// SQLite reports a missing column as "no such column: rules" in reads and updates, and as
// "table templates has no column named rules" in an INSERT column list.
export function isMissingRulesColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /templates[".]?\.?"?rules|no such column:.*rules|has no column named "?rules\b/i.test(message);
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

/** The 403 a template write returns when `owner`'s context is at its template limit. */
export function templateLimitResponse(
  owner: TemplateOwnerContext,
  action: 'create' | 'restore' | 'save',
  limit: number,
  current: number,
): Response {
  return limitReachedResponse({ resource: 'templates', teamId: owner.teamId, action, limit, current });
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

  // Before the rules migration, the retry must leave `rules` out of the statement itself:
  // Drizzle names every table column in an INSERT, so omitting the value alone still fails.
  const runBatch = (omitColumns: readonly string[]) => {
    const templateValues = (omitColumns.length
      ? omitRulesColumn(values as Record<string, unknown>)
      : values) as TemplateInsertValues;
    return capacity
      ? db.batch([
          insertRowWhere(db, templates, templateValues, templateCapacityAvailableSql(capacity), { omitColumns }),
          insertRowWhere(db, template_versions, versionValues, rowExistsSql(templates.id, templateId)),
          insertRowWhere(db, audit_events, auditEventValues, rowExistsSql(templates.id, templateId)),
        ])
      : db.batch([
          db.insert(withoutColumns(templates, omitColumns)).values(templateValues),
          db.insert(template_versions).values(versionValues),
          db.insert(audit_events).values(auditEventValues),
        ]);
  };

  let results: unknown[];
  try {
    results = await runBatch([]);
  } catch (error) {
    if (!isMissingRulesColumnError(error)) {
      throw error;
    }

    results = await runBatch(['rules']);
  }

  const meta = (results[0] as { meta?: { changes?: unknown } } | undefined)?.meta;
  return !(capacity && meta?.changes === 0);
}

export type ReconciledRunUpdate = {
  items: string;
  retiredItems: string;
  progress: number;
  templateVersion: number;
  revision: number;
  whereClause: SQL | undefined;
  updatedAt: string;
  // Written only when the reconcile changed the run, guarded by the run update's WHERE clause
  // and by the template's own audit row, so a save that misses records nothing.
  auditEvent?: AuditEventValues;
};

/**
 * Writes a template edit, its version and audit rows, and the in-progress runs it reconciles,
 * in one batch. `updated` is false when the template no longer matched `whereClause`; then
 * nothing was written. `runResults` holds each run update's result, in order.
 */
export async function updateTemplateWithHistoryFallback(
  db: Db,
  values: TemplateUpdateValues,
  whereClause: SQL | undefined,
  auditEventValues: AuditEventValues,
  versionValues: TemplateVersionValues,
  reconciledRunUpdates: ReconciledRunUpdate[] = [],
): Promise<{ updated: boolean; runResults: unknown[] }> {
  const { audit_events, checklist_runs, template_versions, templates } = schema;
  // The audit row goes first, only while the template still matches whereClause, and every
  // other statement requires that audit row. A plain INSERT would commit even when the
  // UPDATE lost a race, leaving history (and reconciled runs) for a change that never happened.
  const auditWritten = rowExistsSql(audit_events.id, String(auditEventValues.id));
  const templateUpdateIndex = 2;
  const runResultIndexes: number[] = [];
  // Run statements follow the audit insert, version insert, and template update.
  let nextIndex = 3;
  for (const runUpdate of reconciledRunUpdates) {
    if (runUpdate.auditEvent) nextIndex += 1;
    runResultIndexes.push(nextIndex);
    nextIndex += 1;
  }

  const runBatch = (templateValues: TemplateUpdateValues) => {
    const statements = [
      insertRowWhere(db, audit_events, auditEventValues, sql`exists (select 1 from ${templates} where ${whereClause})`),
      insertRowWhere(db, template_versions, versionValues, auditWritten),
      db.update(templates).set(templateValues).where(and(whereClause, auditWritten)),
      ...reconciledRunUpdates.flatMap((runUpdate) => [
        ...(runUpdate.auditEvent
          ? [insertAuditEventWhen(db, runUpdate.auditEvent, sql`exists (select 1 from ${checklist_runs} where ${runUpdate.whereClause}) and ${auditWritten}`)]
          : []),
        db
          .update(checklist_runs)
          .set({
            items: runUpdate.items,
            retired_items: runUpdate.retiredItems,
            progress: runUpdate.progress,
            template_version: runUpdate.templateVersion,
            revision: runUpdate.revision + 1,
            updated_at: runUpdate.updatedAt,
          })
          .where(and(runUpdate.whereClause, auditWritten)),
      ]),
    ] as const;

    return db.batch(statements);
  };

  let results: readonly unknown[];
  try {
    results = await runBatch(values);
  } catch (error) {
    if (!isMissingRulesColumnError(error)) {
      throw error;
    }

    results = await runBatch(omitRulesColumn(values as Record<string, unknown>) as TemplateUpdateValues);
  }
  return {
    updated: !batchUpdateMissed(results[templateUpdateIndex]),
    runResults: runResultIndexes.map((index) => results[index]),
  };
}
