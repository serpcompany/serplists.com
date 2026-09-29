import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";
import { templates } from "./templates";
import { users } from "./users";

export const checklist_runs = sqliteTable("checklist_runs", {
  id: text("id"),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  template_id: text("template_id").references(() => templates.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  items: text("items").notNull(),
  status: text("status").default("in_progress"),
  started_at: text("started_at").notNull(),
  completed_at: text("completed_at"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
  progress: integer("progress").default(0),
  is_public: integer("is_public", { mode: "boolean" }).default(sql`0`),
  share_token: text("share_token"),
  share_expires_at: text("share_expires_at"),
  share_used_at: text("share_used_at"),
  team_id: text("team_id").references(() => teams.id, { onDelete: "set null" }),
  created_by_user_id: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  assigned_to_user_id: text("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),
  started_by_user_id: text("started_by_user_id").references(() => users.id, { onDelete: "set null" }),
  completed_by_user_id: text("completed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  deleted_at: text("deleted_at"),
  template_version: integer("template_version").notNull().default(1),
  revision: integer("revision").notNull().default(1),
  retired_items: text("retired_items").notNull().default("[]"),
}, (table) => [
  primaryKey({ columns: [table.id] }),
  index("idx_checklist_runs_user_id").on(table.user_id),
  index("idx_checklist_runs_template_owner").on(table.template_id, table.team_id, table.user_id),
  index("idx_checklist_runs_share_token").on(table.share_token),
  index("idx_checklist_runs_team_id").on(table.team_id),
]);
