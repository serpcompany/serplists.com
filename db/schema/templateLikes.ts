import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const template_likes = sqliteTable(
  "template_likes",
  {
    user_id: text("user_id").notNull(),
    template_id: text("template_id").notNull(),
    created_at: text("created_at").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.user_id, table.template_id] }),
  })
);
