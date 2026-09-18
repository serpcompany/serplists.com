import { sql } from "drizzle-orm";
import { index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const teams = sqliteTable(
  "teams",
  {
    id: text("id"),
    name: text("name").notNull(),
    slug: text("slug"),
    billing_owner_user_id: text("billing_owner_user_id").references(() => users.id, { onDelete: "set null" }),
    created_by_user_id: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at"),
    archived_at: text("archived_at"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("idx_teams_slug_unique").on(table.slug).where(sql`${table.slug} is not null`),
    index("idx_teams_created_by_user_id").on(table.created_by_user_id),
  ],
);
