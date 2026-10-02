import { sql, type SQL } from "drizzle-orm";
import { schema, type createDb } from "../db";

type Db = ReturnType<typeof createDb>;

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

export function batchWriteMissed(result: unknown): boolean {
  if (typeof result !== "object" || result === null) return false;
  const meta = (result as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return false;
  return (meta as { changes?: unknown }).changes === 0;
}
