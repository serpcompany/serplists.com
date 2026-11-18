import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type TinySchemaChanges = {
  withoutForeignKeys?: boolean;
  withoutEmailVerified?: boolean;
  withoutSitemapRevisions?: boolean;
  aTableOnlyTheDrizzleSchemaHas?: boolean;
  aTriggerOnlyTheMigrationsHave?: boolean;
};

const lines = (...parts: ReadonlyArray<string | false | undefined>): string => parts.filter((part) => typeof part === 'string').join('\n');

function migrationOf(changes: TinySchemaChanges): string {
  return lines(
    'CREATE TABLE users (',
    '  id TEXT PRIMARY KEY,',
    changes.withoutEmailVerified ? '  email TEXT NOT NULL' : '  email TEXT NOT NULL,',
    !changes.withoutEmailVerified && '  email_verified INTEGER NOT NULL DEFAULT (0)',
    ');',
    'CREATE TABLE templates (',
    '  id TEXT PRIMARY KEY,',
    changes.withoutForeignKeys ? '  user_id TEXT NOT NULL,' : '  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,',
    '  title TEXT NOT NULL',
    ');',
    'CREATE INDEX idx_templates_owner ON templates (user_id);',
    !changes.withoutSitemapRevisions && "CREATE TABLE sitemap_revisions (\n  kind TEXT PRIMARY KEY CHECK (kind IN ('profiles', 'templates')),\n  revised_at TEXT NOT NULL\n);",
    'CREATE TABLE counters (',
    '  id INTEGER PRIMARY KEY,',
    '  total INTEGER NOT NULL DEFAULT ((0))',
    ');',
    'CREATE TABLE logs (',
    '  message TEXT',
    ');',
    changes.aTriggerOnlyTheMigrationsHave &&
      'CREATE TRIGGER templates_count AFTER INSERT ON templates BEGIN UPDATE counters SET total = total + 1; END;',
    '',
  );
}

function drizzleSchemaOf(changes: TinySchemaChanges): string {
  return lines(
    'import { sql } from "drizzle-orm";',
    'import { check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";',
    '',
    'export const users = sqliteTable("users", {',
    '  id: text("id"),',
    '  email: text("email").notNull(),',
    !changes.withoutEmailVerified && '  email_verified: integer("email_verified").notNull().default(0),',
    '}, (table) => [primaryKey({ columns: [table.id] })]);',
    '',
    'export const templates = sqliteTable("templates", {',
    '  id: text("id"),',
    changes.withoutForeignKeys
      ? '  user_id: text("user_id").notNull(),'
      : '  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),',
    '  title: text("title").notNull(),',
    '}, (table) => [primaryKey({ columns: [table.id] }), index("idx_templates_owner").on(table.user_id)]);',
    '',
    !changes.withoutSitemapRevisions &&
      'export const sitemapRevisions = sqliteTable("sitemap_revisions", {\n  kind: text("kind"),\n  revised_at: text("revised_at").notNull(),\n}, (table) => [primaryKey({ columns: [table.kind] }), check("sitemap_revisions_kind_check", sql`${table.kind} in (\'profiles\', \'templates\')`)]);\n',
    'export const counters = sqliteTable("counters", {',
    '  id: integer("id"),',
    '  total: integer("total").notNull().default(0),',
    '}, (table) => [primaryKey({ columns: [table.id] })]);',
    '',
    'export const logs = sqliteTable("logs", {',
    '  message: text("message"),',
    '});',
    '',
    changes.aTableOnlyTheDrizzleSchemaHas && 'export const notes = sqliteTable("notes", {\n  id: text("id"),\n}, (table) => [primaryKey({ columns: [table.id] })]);\n',
    '',
  );
}

const NO_SQL_ONLY_TRIGGERS = `${JSON.stringify({ version: 1, description: 'A tiny schema with no SQL-only triggers.', triggers: [] }, null, 2)}\n`;

export function giveTheCopyATinySchema(root: string, changes: TinySchemaChanges = {}): void {
  const migrations = path.join(root, 'db', 'migrations');
  for (const file of readdirSync(migrations)) rmSync(path.join(migrations, file));
  writeFileSync(path.join(migrations, '0001_tiny_schema.sql'), migrationOf(changes));
  writeFileSync(path.join(root, 'db', 'schema', 'index.ts'), drizzleSchemaOf(changes));
  writeFileSync(path.join(root, 'db', 'sql-only-schema.json'), NO_SQL_ONLY_TRIGGERS);
}
