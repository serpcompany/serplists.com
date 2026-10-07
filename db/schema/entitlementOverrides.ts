import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { entitlementOverrideColumns } from "./entitlementOverrideColumns";

export const entitlementOverrides = sqliteTable(
  "entitlement_overrides",
  {
    user_id: text("user_id"),
    ...entitlementOverrideColumns(),
  },
  (table) => [primaryKey({ columns: [table.user_id] })],
);
