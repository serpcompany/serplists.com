import { sql } from "drizzle-orm";
import { index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";
import { users } from "./users";

export const team_members = sqliteTable(
  "team_members",
  {
    id: text("id"),
    team_id: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"),
    status: text("status").notNull().default("active"),
    invited_by_user_id: text("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    joined_at: text("joined_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    uniqueIndex("idx_team_members_team_user_unique").on(table.team_id, table.user_id),
    index("idx_team_members_user_id").on(table.user_id),
    index("idx_team_members_team_role").on(table.team_id, table.role),
    uniqueIndex("idx_team_members_active_owner_unique")
      .on(table.team_id)
      .where(sql`${table.role} = 'owner' and ${table.status} = 'active'`),
  ],
);
