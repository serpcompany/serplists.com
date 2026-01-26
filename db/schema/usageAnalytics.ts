import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const usage_analytics = sqliteTable("usage_analytics", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  action: text("action").notNull(),
  resource_id: text("resource_id"),
  metadata: text("metadata"),
  created_at: text("created_at").notNull(),
});
