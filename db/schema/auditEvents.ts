import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const audit_events = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actor_user_id: text("actor_user_id"),
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
});
