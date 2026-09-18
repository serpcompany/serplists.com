import { sql } from "drizzle-orm";
import { index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const personal_run_keys = sqliteTable(
  "personal_run_keys",
  {
    id: text("id").notNull(),
    user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key_prefix: text("key_prefix").notNull(),
    key_hash: text("key_hash").notNull(),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    last_used_at: text("last_used_at"),
    revoked_at: text("revoked_at"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_personal_run_keys_user_id").on(table.user_id),
    uniqueIndex("idx_personal_run_keys_key_hash_unique").on(table.key_hash),
  ],
);
