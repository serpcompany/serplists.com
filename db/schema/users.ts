import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  password_hash: text("password_hash").notNull(),
  name: text("name"),
  avatar_url: text("avatar_url"),
  username: text("username"),
  affiliate_code: text("affiliate_code"),
  referral_count: integer("referral_count"),
  total_earnings: real("total_earnings"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
});
