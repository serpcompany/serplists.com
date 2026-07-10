import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const template_versions = sqliteTable("template_versions", {
  id: text("id").primaryKey(),
  template_id: text("template_id").notNull(),
  version: integer("version").notNull(),
  changed_by_user_id: text("changed_by_user_id").notNull(),
  subject_type: text("subject_type").notNull(),
  subject_id: text("subject_id").notNull(),
  snapshot_json: text("snapshot_json").notNull(),
  content_hash: text("content_hash"),
  change_summary: text("change_summary"),
  created_at: text("created_at").notNull(),
});
