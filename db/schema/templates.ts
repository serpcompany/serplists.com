import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const templates = sqliteTable("templates", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  items: text("items").notNull(),
  version: integer("version").notNull().default(1),
  type: text("type").notNull().default("checklist"),
  seo_title: text("seo_title"),
  seo_description: text("seo_description"),
  rules: text("rules"),
  is_public: integer("is_public", { mode: "boolean" }).default(false),
  category: text("category"),
  tags: text("tags"),
  slug: text("slug"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
});
