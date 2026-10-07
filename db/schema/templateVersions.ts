import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { templates } from "./templates";
import { users } from "./users";

export const templateVersions = sqliteTable("template_versions", {
  id: text("id"),
  template_id: text("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  changed_by_user_id: text("changed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  subject_type: text("subject_type").notNull(),
  subject_id: text("subject_id").notNull(),
  snapshot_json: text("snapshot_json").notNull(),
  content_hash: text("content_hash"),
  change_summary: text("change_summary"),
  created_at: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.id] }),
  uniqueIndex("idx_template_versions_template_version_unique").on(table.template_id, table.version),
]);
