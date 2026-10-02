import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { createDb, schema } from '../db';
import type { Env } from '../types';
import { batchWriteMissed } from './guarded-writes';
import { allConditions, insertRowWhere, rowExistsSql, withoutColumns } from './guarded-insert';
import { limitReachedResponse } from './limit-reached';

type Db = ReturnType<typeof createDb>;
export type TemplateInsertValues = typeof schema.templates.$inferInsert;
export type TemplateUpdateValues = Partial<TemplateInsertValues>;
export type AuditEventValues = typeof schema.auditEvents.$inferInsert;
export type TemplateVersionValues = typeof schema.templateVersions.$inferInsert;

export type TemplateOwnerContext = { userId: string; teamId: string | null };
export type TemplateCapacity = { owner: TemplateOwnerContext; limit: number };

export function isMissingRulesColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /templates[".]?\.?"?rules|no such column:.*rules|has no column named "?rules\b/i.test(message);
}

function omitRulesColumn<T extends Record<string, unknown>>(values: T): Omit<T, 'rules'> {
  const { rules, ...rest } = values;
  return rest;
}

function templatesInContext(owner: TemplateOwnerContext): SQL {
  const { templates } = schema;
  return owner.teamId
    ? allConditions(eq(templates.owner_type, 'team'), eq(templates.team_id, owner.teamId), isNull(templates.deleted_at))
    : allConditions(eq(templates.owner_type, 'user'), eq(templates.user_id, owner.userId), isNull(templates.team_id), isNull(templates.deleted_at));
}

export async function countTemplates(env: Env, owner: TemplateOwnerContext): Promise<number> {
  const [row] = await createDb(env)
    .select({ count: sql<number>`count(*)` })
    .from(schema.templates)
    .where(templatesInContext(owner))
    .limit(1);
  return row?.count ?? 0;
}

export function templateCapacityAvailableSql({ owner, limit }: TemplateCapacity): SQL {
  return sql`(select count(*) from ${schema.templates} where ${templatesInContext(owner)}) < ${limit}`;
}

export function templateLimitResponse(
  owner: TemplateOwnerContext,
  action: 'create' | 'restore' | 'save',
  limit: number,
  current: number,
): Response {
  return limitReachedResponse({ resource: 'templates', teamId: owner.teamId, action, limit, current });
}

export async function insertTemplateWithHistoryFallback(
  db: Db,
  values: TemplateInsertValues,
  versionValues: TemplateVersionValues,
  auditEventValues: AuditEventValues,
  capacity?: TemplateCapacity,
): Promise<boolean> {
  const { auditEvents, templateVersions, templates } = schema;
  const templateId = String(values.id);

  const runBatch = (omitColumns: readonly string[]) => {
    const templateValues: TemplateInsertValues = omitColumns.length ? omitRulesColumn(values) : values;
    return capacity
      ? db.batch([
          insertRowWhere(db, templates, templateValues, templateCapacityAvailableSql(capacity), { omitColumns }),
          insertRowWhere(db, templateVersions, versionValues, rowExistsSql(templates.id, templateId)),
          insertRowWhere(db, auditEvents, auditEventValues, rowExistsSql(templates.id, templateId)),
        ])
      : db.batch([
          db.insert(withoutColumns(templates, omitColumns)).values(templateValues),
          db.insert(templateVersions).values(versionValues),
          db.insert(auditEvents).values(auditEventValues),
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

  return !(capacity && batchWriteMissed(results[0]));
}

export type ReconciledRunUpdate = {
  items: string;
  retiredItems: string;
  progress: number;
  templateVersion: number;
  revision: number;
  whereClause: SQL | undefined;
  updatedAt: string;
  auditEvent: AuditEventValues | undefined;
};

export async function updateTemplateWithHistoryFallback(
  db: Db,
  values: TemplateUpdateValues,
  whereClause: SQL | undefined,
  auditEventValues: AuditEventValues,
  versionValues: TemplateVersionValues,
  reconciledRunUpdates: ReconciledRunUpdate[] = [],
): Promise<{ updated: boolean; runResults: unknown[] }> {
  const { auditEvents, checklistRuns, templateVersions, templates } = schema;
  const auditWritten = rowExistsSql(auditEvents.id, String(auditEventValues.id));
  const templateUpdateIndex = 2;
  const runResultIndexes: number[] = [];
  let nextIndex = templateUpdateIndex + 1;
  for (const runUpdate of reconciledRunUpdates) {
    if (runUpdate.auditEvent) nextIndex += 1;
    runResultIndexes.push(nextIndex);
    nextIndex += 1;
  }

  const runBatch = (templateValues: TemplateUpdateValues) => {
    const statements = [
      insertRowWhere(db, auditEvents, auditEventValues, sql`exists (select 1 from ${templates} where ${whereClause})`),
      insertRowWhere(db, templateVersions, versionValues, auditWritten),
      db.update(templates).set(templateValues).where(and(whereClause, auditWritten)),
      ...reconciledRunUpdates.flatMap((runUpdate) => [
        ...(runUpdate.auditEvent
          ? [insertRowWhere(db, auditEvents, runUpdate.auditEvent, sql`exists (select 1 from ${checklistRuns} where ${runUpdate.whereClause}) and ${auditWritten}`)]
          : []),
        db
          .update(checklistRuns)
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
    updated: !batchWriteMissed(results[templateUpdateIndex]),
    runResults: runResultIndexes.map((index) => results[index]),
  };
}
