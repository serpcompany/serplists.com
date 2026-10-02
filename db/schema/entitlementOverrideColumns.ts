import { integer, text } from "drizzle-orm/sqlite-core";

export const entitlementOverrideColumns = () => ({
  plan: text("plan").notNull(),
  expires_at: integer("expires_at"),
  note: text("note"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
});
