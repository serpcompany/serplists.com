import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";
import { users } from "./users";

export const templates = sqliteTable("templates", {
  id: text("id"),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  items: text("items").notNull(),
  is_public: integer("is_public", { mode: "boolean" }).default(sql`0`),
  category: text("category"),
  tags: text("tags"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
  slug: text("slug"),
  version: integer("version").notNull().default(1),
  type: text("type").notNull().default("checklist"),
  seo_title: text("seo_title"),
  seo_description: text("seo_description"),
  rules: text("rules"),
  owner_type: text("owner_type").notNull().default("user"),
  team_id: text("team_id").references(() => teams.id, { onDelete: "set null" }),
  created_by_user_id: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  updated_by_user_id: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  deleted_at: text("deleted_at"),
  content_version: integer("content_version").notNull().default(1),
  required_tools: text("required_tools"),
}, (table) => [
  primaryKey({ columns: [table.id] }),
  uniqueIndex("idx_templates_slug_unique").on(table.slug),
  index("idx_templates_public_created_at").on(table.is_public, table.created_at),
  index("idx_templates_owner").on(table.owner_type, table.user_id, table.team_id),
  index("idx_templates_team_id").on(table.team_id),
]);
