import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { entitlementOverrideColumns } from "./entitlementOverrideColumns";
import { teams } from "./teams";

export const team_entitlement_overrides = sqliteTable(
  "team_entitlement_overrides",
  {
    team_id: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    ...entitlementOverrideColumns(),
  },
  (table) => [primaryKey({ columns: [table.team_id] })],
);
