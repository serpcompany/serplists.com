import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const entitlement_overrides = sqliteTable(
  "entitlement_overrides",
  {
    user_id: text("user_id"),
    plan: text("plan").notNull(),
    expires_at: integer("expires_at"),
    note: text("note"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at"),
  },
  (table) => [primaryKey({ columns: [table.user_id] })],
);
