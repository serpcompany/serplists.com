import { sql, type SQL } from "drizzle-orm";
import { schema, type createDb } from "../db";

type Db = ReturnType<typeof createDb>;

// D1 runs a batch as one transaction, but a handler validates with a SELECT in an
// earlier round trip. Guarded statements re-check their preconditions in SQL so a
// change that commits in between turns the write into a no-op instead of a partial one.

/**
 * Inserts an audit event only when `guard` holds as the statement runs. Put it in the
 * same batch after the write it records, and guard on that write's effect (for example
 * `updated_at = now`), so a skipped write never logs an event.
 */
export function insertAuditEventWhere(
  db: Db,
  auditEvent: typeof schema.audit_events.$inferInsert,
  guard: SQL,
) {
  return db.insert(schema.audit_events).select(sql`
    select
      ${auditEvent.id},
      ${auditEvent.actor_user_id},
      ${auditEvent.subject_type},
      ${auditEvent.subject_id},
      ${auditEvent.resource_type},
      ${auditEvent.resource_id},
      ${auditEvent.action},
      ${auditEvent.before_json},
      ${auditEvent.after_json},
      ${auditEvent.diff_json},
      ${auditEvent.metadata_json},
      ${auditEvent.request_id},
      ${auditEvent.ip_hash},
      ${auditEvent.user_agent},
      ${auditEvent.created_at}
    where ${guard}
  `);
}

/** True when a D1 batch result reports that its write changed no rows. */
export function batchWriteMissed(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  const meta = (result as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return false;
  return (meta as { changes?: unknown }).changes === 0;
}
