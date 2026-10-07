import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { templates } from "./templates";
import { users } from "./users";

export const templateLikes = sqliteTable(
  "template_likes",
  {
    user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    template_id: text("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
    created_at: text("created_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user_id, table.template_id] }),
  })
);
