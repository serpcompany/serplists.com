import { sql } from "drizzle-orm";
import { check, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const publicHandles = sqliteTable(
  "public_handles",
  {
    handle: text("handle").notNull(),
    owner_type: text("owner_type", { enum: ["user", "team"] }).notNull(),
    owner_id: text("owner_id").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.handle] }),
    uniqueIndex("idx_public_handles_owner").on(table.owner_type, table.owner_id),
    check("public_handles_owner_type_check", sql`${table.owner_type} in ('user', 'team')`),
  ],
);
