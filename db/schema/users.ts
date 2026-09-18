import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id"),
    email: text("email").notNull().unique(),
    password_hash: text("password_hash"),
    name: text("name"),
    avatar_url: text("avatar_url"),
    username: text("username"),
    displayUsername: text("display_username"),
    email_verified: integer("email_verified", { mode: "boolean" }).notNull().default(sql`0`),
    auth_created_at: integer("auth_created_at", { mode: "timestamp_ms" }),
    auth_updated_at: integer("auth_updated_at", { mode: "timestamp_ms" }),
    affiliate_code: text("affiliate_code"),
    referral_count: integer("referral_count").default(0),
    total_earnings: real("total_earnings").default(0),
    created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updated_at: text("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    index("idx_users_email").on(table.email),
    uniqueIndex("idx_users_username").on(table.username),
  ],
);
