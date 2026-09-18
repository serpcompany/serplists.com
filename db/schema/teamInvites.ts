import { index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";
import { users } from "./users";

export const team_invites = sqliteTable(
  "team_invites",
  {
    id: text("id"),
    team_id: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("viewer"),
    token_hash: text("token_hash").notNull(),
    invited_by_user_id: text("invited_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    accepted_by_user_id: text("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expires_at: text("expires_at").notNull(),
    accepted_at: text("accepted_at"),
    revoked_at: text("revoked_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("idx_team_invites_token_hash_unique").on(table.token_hash),
    index("idx_team_invites_team_email").on(table.team_id, table.email),
    index("idx_team_invites_email").on(table.email),
  ],
);
