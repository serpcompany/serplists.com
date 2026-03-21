import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const checklist_runs = sqliteTable("checklist_runs", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  template_id: text("template_id"),
  title: text("title").notNull(),
  items: text("items").notNull(),
  status: text("status").notNull(),
  started_at: text("started_at").notNull(),
  completed_at: text("completed_at"),
  is_public: integer("is_public", { mode: "boolean" }).default(false),
  share_token: text("share_token"),
  share_expires_at: text("share_expires_at"),
  share_used_at: text("share_used_at"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
  progress: integer("progress").default(0),
});
