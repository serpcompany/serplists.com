import { sql, type SQL } from "drizzle-orm";
import { schema, type createDb } from "../db";

type Db = ReturnType<typeof createDb>;

/**
 * Inserts an audit event only when `condition` holds when the statement runs.
 * Put it in the same db.batch as a guarded write, with a condition that is
 * true only if that write landed, so a write that lost a race leaves no audit row.
 */
export function insertAuditEventWhen(
  db: Db,
  auditEvent: typeof schema.audit_events.$inferInsert,
  condition: SQL,
) {
  const { audit_events } = schema;

  return db.insert(audit_events).select(sql`
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
    where ${condition}
  `);
}
