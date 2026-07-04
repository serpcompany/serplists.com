import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const team_invites = sqliteTable("team_invites", {
  id: text("id").primaryKey(),
  team_id: text("team_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("viewer"),
  token_hash: text("token_hash").notNull(),
  invited_by_user_id: text("invited_by_user_id").notNull(),
  accepted_by_user_id: text("accepted_by_user_id"),
  expires_at: text("expires_at").notNull(),
  accepted_at: text("accepted_at"),
  revoked_at: text("revoked_at"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
});
