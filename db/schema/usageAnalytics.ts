import { index, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const usage_analytics = sqliteTable(
  "usage_analytics",
  {
    id: text("id"),
    user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    resource_id: text("resource_id"),
    metadata: text("metadata"),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_usage_analytics_user_id").on(table.user_id),
    index("idx_usage_analytics_action").on(table.action),
  ],
);
