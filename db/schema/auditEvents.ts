import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const auditEvents = sqliteTable("audit_events", {
  id: text("id"),
  actor_user_id: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  subject_type: text("subject_type").notNull(),
  subject_id: text("subject_id").notNull(),
  resource_type: text("resource_type").notNull(),
  resource_id: text("resource_id").notNull(),
  action: text("action").notNull(),
  before_json: text("before_json"),
  after_json: text("after_json"),
  diff_json: text("diff_json"),
  metadata_json: text("metadata_json"),
  request_id: text("request_id"),
  ip_hash: text("ip_hash"),
  user_agent: text("user_agent"),
  created_at: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.id] }),
  index("idx_audit_events_subject").on(table.subject_type, table.subject_id, table.created_at),
  index("idx_audit_events_resource").on(table.resource_type, table.resource_id, table.created_at),
]);
