import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { teams } from "./teams";

export const team_entitlement_overrides = sqliteTable(
  "team_entitlement_overrides",
  {
    team_id: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    plan: text("plan").notNull(),
    expires_at: integer("expires_at"),
    note: text("note"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at"),
  },
  (table) => [primaryKey({ columns: [table.team_id] })],
);
