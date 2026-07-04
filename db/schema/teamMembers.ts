import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const team_members = sqliteTable("team_members", {
  id: text("id").primaryKey(),
  team_id: text("team_id").notNull(),
  user_id: text("user_id").notNull(),
  role: text("role").notNull().default("viewer"),
  status: text("status").notNull().default("active"),
  invited_by_user_id: text("invited_by_user_id"),
  joined_at: text("joined_at"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
});
