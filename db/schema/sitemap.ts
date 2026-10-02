import { sql } from "drizzle-orm";
import { check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sitemapRevisions = sqliteTable(
  "sitemap_revisions",
  {
    kind: text("kind", { enum: ["profiles", "templates", "categories"] }),
    revised_at: text("revised_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.kind] }),
    check(
      "sitemap_revisions_kind_check",
      sql`${table.kind} in ('profiles', 'templates', 'categories')`,
    ),
  ],
);

export const sitemapProfileRevisions = sqliteTable(
  "sitemap_profile_revisions",
  {
    user_id: text("user_id"),
    revised_at: text("revised_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.user_id] })],
);

export const sitemapOwnerRevisions = sqliteTable(
  "sitemap_owner_revisions",
  {
    user_id: text("user_id"),
    revised_at: text("revised_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.user_id] })],
);

export const sitemapCategoryRevisions = sqliteTable(
  "sitemap_category_revisions",
  {
    category: text("category"),
    revised_at: text("revised_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.category] })],
);

export const sitemapShardRevisions = sqliteTable(
  "sitemap_shard_revisions",
  {
    kind: text("kind").notNull(),
    page: integer("page").notNull(),
    content_hash: text("content_hash").notNull(),
    revised_at: text("revised_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.page] })],
);
