import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug"),
  billing_owner_user_id: text("billing_owner_user_id"),
  created_by_user_id: text("created_by_user_id").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
  archived_at: text("archived_at"),
});
