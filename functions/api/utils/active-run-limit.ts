import { and, eq, getTableColumns, is, isNull, SQL, sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { createDb, schema } from "../db";

// Enforces the Free plan's active run limit in the same statement that inserts the run.
// A separate count followed by an insert lets concurrent requests all read a count
// under the limit and all insert; D1 runs each statement atomically, so a guarded
// INSERT ... SELECT ... WHERE (count) < limit cannot overshoot.

type Db = ReturnType<typeof createDb>;
type RunValues = typeof schema.checklist_runs.$inferInsert;
type AuditValues = typeof schema.audit_events.$inferInsert;

/** Runs that count toward a Personal owner's active run limit. */
export function personalActiveRunsWhere(userId: string): SQL {
  const runs = schema.checklist_runs;
  return and(
    eq(runs.user_id, userId),
    isNull(runs.team_id),
    eq(runs.status, "in_progress"),
    isNull(runs.deleted_at),
  ) as SQL;
}

export async function countActiveRuns(db: Db, activeRunsWhere: SQL): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.checklist_runs)
    .where(activeRunsWhere)
    .limit(1);
  return row?.count ?? 0;
}

// The SELECT list for an INSERT ... SELECT: one value per insertable column, in the
// order Drizzle lists the table's columns, falling back to column defaults. Drizzle
// leaves generated columns (other than "by default") out of the insert column list.
function insertSelectValues(table: SQLiteTable, values: Record<string, unknown>): SQL {
  const columns = Object.entries(getTableColumns(table))
    .filter(([, column]) => column.generated === undefined || column.generated.type === "byDefault");
  return sql.join(columns.map(([field, column]) => {
    const value = values[field];
    if (value !== undefined) return sql.param(value, column);
    if (column.default === undefined || column.default === null) return sql`null`;
    return is(column.default, SQL) ? column.default : sql.param(column.default, column);
  }), sql`, `);
}

/**
 * Inserts `run` only while fewer than `limit` runs match `activeRunsWhere`. The result's
 * meta.changes is 0 when the limit refused the run.
 */
export function insertRunUnderActiveRunLimit(db: Db, run: RunValues, activeRunsWhere: SQL, limit: number) {
  const runs = schema.checklist_runs;
  return db.insert(runs).select(sql`
    select ${insertSelectValues(runs, run)}
    where (select count(*) from ${runs} where ${activeRunsWhere}) < ${limit}`);
}

/** Inserts the audit event only if its run row exists, so a refused run leaves no audit row. */
export function insertAuditWhenRunExists(db: Db, auditEvent: AuditValues, runId: string) {
  const runs = schema.checklist_runs;
  return db.insert(schema.audit_events).select(sql`
    select ${insertSelectValues(schema.audit_events, auditEvent)}
    where exists (select 1 from ${runs} where ${runs.id} = ${runId})`);
}
