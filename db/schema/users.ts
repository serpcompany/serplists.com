import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  password_hash: text("password_hash"),
  name: text("name"),
  avatar_url: text("avatar_url"),
  username: text("username"),
  displayUsername: text("display_username"),
  email_verified: integer("email_verified", { mode: "boolean" }),
  auth_created_at: integer("auth_created_at", { mode: "timestamp_ms" }),
  auth_updated_at: integer("auth_updated_at", { mode: "timestamp_ms" }),
  affiliate_code: text("affiliate_code"),
  referral_count: integer("referral_count"),
  total_earnings: real("total_earnings"),
  created_at: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updated_at: text("updated_at"),
});
