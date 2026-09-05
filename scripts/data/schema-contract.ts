import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

type Database = InstanceType<typeof DatabaseSync>;

export interface DrizzleContract {
  strictObjects?: boolean;
  allowedForeignKeys?: Record<string, Array<{ columns: string[]; referencedTable: string; referencedColumns: string[]; onUpdate: string; onDelete: string }>>;
  tables: Record<string, {
    foreignKeys?: DatabaseCatalog["tables"][string]["foreignKeys"];
    columns: Array<{
      name: string;
      affinity: string;
      notNull: boolean;
      defaultValue: string | null;
      primaryKey: number;
    }>;
    indexes: Array<{
      name: string;
      unique?: boolean;
      partial?: boolean;
      columns: string[];
      matchByColumns?: boolean;
      predicate?: string | null;
      sql?: string | null;
      keys?: IndexKey[];
    }>;
  }>;
}

interface IndexKey { column: string | null; collation: string; descending: boolean }

export interface DatabaseCatalog {
  tables: Record<string, {
    sql?: string;
    columns: Array<{ name: string; type: string; notNull: boolean; defaultValue: string | null; primaryKey: number }>;
    indexes: Array<{ name: string; unique: boolean; partial: boolean; columns: string[]; predicate: string | null; sql?: string | null; keys?: IndexKey[] }>;
    foreignKeys: Array<{ columns: string[]; referencedTable: string; referencedColumns: string[]; onUpdate: string; onDelete: string }>;
  }>;
  triggers: Array<{ name: string; table: string; sql: string | null }>;
  views: Array<{ name: string; sql: string }>;
}

interface PragmaResult {
  results?: Array<Record<string, unknown>>;
}

const migrationsDirectory = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
export const SQL_ONLY_OBJECT_ALLOWLIST = Object.freeze({
  tables: ["sitemap_revisions", "sitemap_profile_revisions", "sitemap_owner_revisions", "sitemap_category_revisions", "sitemap_shard_revisions"],
  indexes: [
    "idx_audit_events_actor", "idx_audit_events_resource", "idx_audit_events_subject",
    "idx_checklist_runs_assigned_to_user_id", "idx_checklist_runs_share_token", "idx_checklist_runs_status", "idx_checklist_runs_team_id", "idx_checklist_runs_template_id", "idx_checklist_runs_user_id",
    "idx_team_invites_email", "idx_team_invites_team_email", "idx_team_invites_token_hash_unique",
    "idx_team_members_active_owner_unique", "idx_team_members_team_role", "idx_team_members_team_user_unique", "idx_team_members_user_id",
    "idx_teams_created_by_user_id", "idx_teams_slug_unique", "idx_template_versions_subject", "idx_template_versions_template_version_unique",
    "idx_templates_category", "idx_templates_owner", "idx_templates_public", "idx_templates_slug", "idx_templates_slug_unique", "idx_templates_team_id", "idx_templates_user_id",
    "idx_usage_analytics_action", "idx_usage_analytics_user_id", "idx_users_email", "idx_users_username", "stripe_subscriptions_customer_id_idx", "stripe_subscriptions_user_id_idx",
  ],
  triggers: ["sitemap_owner_users_insert", "sitemap_templates_delete", "sitemap_templates_insert", "sitemap_templates_update", "sitemap_users_delete", "sitemap_users_delete_cleanup", "sitemap_users_insert", "sitemap_users_update_owner", "sitemap_users_update_profile"],
  views: [],
});

// Historical D1 relations created before Drizzle relation metadata was adopted.
// New relations must be declared in Drizzle; this list may only shrink.
export const SQL_ONLY_RELATION_ALLOWLIST = Object.freeze({
  account: [["user_id", "users", "id", "no action", "cascade"]],
  audit_events: [["actor_user_id", "users", "id", "no action", "set null"]],
  checklist_runs: [
    ["template_id", "templates", "id", "no action", "set null"], ["user_id", "users", "id", "no action", "cascade"],
    ["completed_by_user_id", "users", "id", "no action", "set null"], ["started_by_user_id", "users", "id", "no action", "set null"],
    ["assigned_to_user_id", "users", "id", "no action", "set null"], ["created_by_user_id", "users", "id", "no action", "set null"], ["team_id", "teams", "id", "no action", "set null"],
  ],
  session: [["user_id", "users", "id", "no action", "cascade"]],
  stripe_subscriptions: [["user_id", "users", "id", "no action", "cascade"]],
  team_entitlement_overrides: [["team_id", "teams", "id", "no action", "cascade"]],
  team_invites: [["accepted_by_user_id", "users", "id", "no action", "set null"], ["invited_by_user_id", "users", "id", "no action", "restrict"], ["team_id", "teams", "id", "no action", "cascade"]],
  team_members: [["invited_by_user_id", "users", "id", "no action", "set null"], ["user_id", "users", "id", "no action", "cascade"], ["team_id", "teams", "id", "no action", "cascade"]],
  teams: [["created_by_user_id", "users", "id", "no action", "restrict"], ["billing_owner_user_id", "users", "id", "no action", "set null"]],
  template_likes: [["template_id", "templates", "id", "no action", "cascade"], ["user_id", "users", "id", "no action", "cascade"]],
  template_versions: [["changed_by_user_id", "users", "id", "no action", "restrict"], ["template_id", "templates", "id", "no action", "cascade"]],
  templates: [["user_id", "users", "id", "no action", "cascade"], ["updated_by_user_id", "users", "id", "no action", "set null"], ["created_by_user_id", "users", "id", "no action", "set null"], ["team_id", "teams", "id", "no action", "set null"]],
  usage_analytics: [["user_id", "users", "id", "no action", "cascade"]],
});

function relationFromTuple(tuple: readonly string[]) {
  return { columns: [tuple[0]], referencedTable: tuple[1], referencedColumns: [tuple[2]], onUpdate: tuple[3], onDelete: tuple[4] };
}

export function parseRemoteTableInventory(output: string) {
  const parsed = JSON.parse(output);
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry?.results ?? []);
  const names = rows.map((row) => row?.name).filter((name) => typeof name === "string" && !name.startsWith("sqlite_") && name !== "_cf_METADATA").sort();
  if (!names.length) throw new Error("Remote table inventory is empty or malformed.");
  return [...new Set(names)];
}

export function diffUnapprovedSqlOnlyObjects(contract: DrizzleContract, catalog: DatabaseCatalog, allowlist: Readonly<Record<'tables' | 'indexes' | 'triggers' | 'views', readonly string[]>> = SQL_ONLY_OBJECT_ALLOWLIST) {
  const runtimeTables = new Set(Object.keys(contract.tables));
  const expectedIndexes = new Set(Object.values(contract.tables).flatMap((table) => table.indexes.map((index) => index.name)));
  const unexpectedTables = Object.keys(catalog.tables).filter((name) => !runtimeTables.has(name) && !allowlist.tables.includes(name));
  const unexpectedIndexes = Object.values(catalog.tables).flatMap((table) => table.indexes.map((index) => index.name))
    .filter((name) => !name.startsWith("sqlite_autoindex_") && !expectedIndexes.has(name) && !allowlist.indexes.includes(name));
  const unexpectedTriggers = catalog.triggers.map((trigger) => trigger.name).filter((name) => !allowlist.triggers.includes(name));
  const unexpectedViews = catalog.views.map((view) => view.name).filter((name) => !allowlist.views.includes(name));
  return { unexpectedTables, unexpectedIndexes, unexpectedTriggers, unexpectedViews, verdict: unexpectedTables.length || unexpectedIndexes.length || unexpectedTriggers.length || unexpectedViews.length ? "fail" : "pass" } as const;
}

export function listMigrationFiles(directory = migrationsDirectory) {
  return readdirSync(directory)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((name) => ({
      name,
      sql: readFileSync(path.join(directory, name), "utf8"),
    }));
}

export function replayMigrations(options: { through?: string; migrationDirectory?: string } = {}) {
  const database = new DatabaseSync(":memory:");
  const migrations = listMigrationFiles(options.migrationDirectory);
  const endIndex = options.through
    ? migrations.findIndex((migration) => migration.name === options.through)
    : migrations.length - 1;

  if (options.through && endIndex === -1) {
    database.close();
    throw new Error(`Unknown migration boundary: ${options.through}`);
  }

  for (const migration of migrations.slice(0, endIndex + 1)) {
    try {
      database.exec(migration.sql);
    } catch (error) {
      database.close();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${migration.name} failed during fresh replay: ${message}`);
    }
  }

  return database;
}

export function buildDrizzleContract(schema: Record<string, unknown>): DrizzleContract {
  const dialect = new SQLiteSyncDialect();
  const tables = Object.values(schema)
    .map((table) => getTableConfig(table as Parameters<typeof getTableConfig>[0]))
    .sort((left, right) => left.name.localeCompare(right.name, "en"));

  return {
    strictObjects: true,
    allowedForeignKeys: Object.fromEntries(Object.entries(SQL_ONLY_RELATION_ALLOWLIST).map(([table, relations]) => [table, relations.map(relationFromTuple)])),
    tables: Object.fromEntries(tables.map((table) => {
      const explicitIndexes = table.indexes.map((index) => ({
        name: index.config.name,
        unique: Boolean(index.config.unique),
        partial: Boolean(index.config.where),
        columns: index.config.columns.map((column) => {
          if ("name" in column && typeof column.name === "string") return column.name;
          throw new Error(`Drizzle index ${index.config.name} contains a non-column expression that cannot be verified through PRAGMA index_info.`);
        }),
        predicate: index.config.where
          ? normalizeDrizzleSql(index.config.where, dialect)
          : null,
      }));
      const columnUniqueIndexes = table.columns
        .filter((column) => column.isUnique)
        .map((column) => {
          const name = column.uniqueName;
          if (typeof name !== 'string') throw new Error('Drizzle unique column has no resolved name.');
          return {
            name,
            unique: true,
            partial: false,
            columns: [column.name],
            matchByColumns: true,
            predicate: null,
          };
        });
      const tableUniqueIndexes = table.uniqueConstraints.map((constraint) => {
        const name = constraint.getName();
        if (typeof name !== 'string') throw new Error('Drizzle unique constraint has no resolved name.');
        return {
          name,
          unique: true,
          partial: false,
          columns: constraint.columns.map((column) => column.name),
          matchByColumns: true,
          predicate: null,
        };
      });
      const indexes = [...explicitIndexes, ...columnUniqueIndexes, ...tableUniqueIndexes]
        .sort((left, right) => left.name.localeCompare(right.name, "en"));
      return [
      table.name,
      {
        columns: table.columns.map((column) => {
          const compositePosition = table.primaryKeys
            .flatMap((key) => key.columns)
            .findIndex((primaryColumn) => primaryColumn.name === column.name);
          const primaryKey = compositePosition >= 0 ? compositePosition + 1 : column.primary ? 1 : 0;
          return {
            name: column.name,
            affinity: sqliteAffinity(column.getSQLType()),
            notNull: Boolean(column.notNull || primaryKey),
            defaultValue: normalizeDrizzleDefault(column.default, dialect),
            primaryKey,
          };
        }).sort((left, right) => left.name.localeCompare(right.name, "en")),
        indexes,
        foreignKeys: table.foreignKeys.map((foreignKey) => {
          const reference = foreignKey.reference();
          return {
            columns: reference.columns.map((column) => column.name),
            referencedTable: getTableConfig(reference.foreignTable).name,
            referencedColumns: reference.foreignColumns.map((column) => column.name),
            onUpdate: (foreignKey.onUpdate ?? "no action").toLowerCase(),
            onDelete: (foreignKey.onDelete ?? "no action").toLowerCase(),
          };
        }),
      },
    ];
    })),
  };
}

export function buildCatalogContract(catalog: DatabaseCatalog): DrizzleContract {
  return {
    strictObjects: true,
    tables: Object.fromEntries(Object.entries(catalog.tables).map(([name, table]) => [name, {
      columns: table.columns.map((column) => ({
        name: column.name,
        affinity: sqliteAffinity(column.type),
        notNull: column.notNull,
        defaultValue: normalizeDefault(column.defaultValue),
        primaryKey: column.primaryKey,
      })),
      indexes: table.indexes.map((index) => ({
        name: index.name,
        unique: index.unique,
        partial: index.partial,
        columns: index.columns,
        predicate: index.predicate,
        sql: index.sql,
        keys: index.keys,
      })),
      foreignKeys: table.foreignKeys.map((foreignKey) => ({
        ...foreignKey,
        columns: [...foreignKey.columns],
        referencedColumns: [...foreignKey.referencedColumns],
      })),
    }])),
  };
}

function withoutSqlComments(sql: string): string {
  let result = '';
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (["'", '"', '`', '['].includes(character)) {
      const end = character === '[' ? ']' : character;
      result += character; index++;
      while (index < sql.length) {
        const value = sql[index]; result += value; index++;
        if (value === end) {
          if (end !== ']' && sql[index] === end) { result += sql[index]; index++; }
          else break;
        }
      }
    } else if (sql.startsWith('--', index)) {
      while (index < sql.length && !['\n', '\r'].includes(sql[index])) index++;
      result += ' ';
    } else if (sql.startsWith('/*', index)) {
      const end = sql.indexOf('*/', index + 2);
      if (end === -1) throw new Error('Unterminated SQL comment.');
      index = end + 2; result += ' ';
    } else { result += character; index++; }
  }
  return result;
}

function sqliteCaseFold(value: string): string {
  // SQLite identifier case folding is ASCII-only; Ä and ä are distinct names.
  return value.replace(/[A-Z]/g, character => character.toLowerCase());
}

export function normalizeSql(sql: unknown, preserveQuotes = false): string | null {
  if (sql == null) return null;
  let normalized = withoutSqlComments(String(sql))
    .split(/('(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\])/)
    .map((part, index) => index % 2
      ? (preserveQuotes || part.startsWith("'") ? part : sqliteCaseFold(part.slice(1, -1)))
      : sqliteCaseFold(part).replace(/\s+/g, " "))
    .join("")
    .trim()
    .replace(/;$/, "");
  // Strip only parentheses enclosing the entire expression, never (a)+(b).
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    const unquoted = normalized.replace(/('(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\])/g, token => " ".repeat(token.length));
    let depth = 0;
    let encloses = true;
    for (let index = 0; index < unquoted.length; index++) {
      if (unquoted[index] === "(") depth++;
      if (unquoted[index] === ")") depth--;
      if (depth === 0 && index < unquoted.length - 1) { encloses = false; break; }
    }
    if (!encloses || depth !== 0) break;
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

export function normalizeTableDefinition(sql: unknown, normalizeDefaults = true): string | null {
  if (sql == null) return null;
  const source = withoutSqlComments(String(sql));
  const tokens: Array<{ value: string; wordLike: boolean }> = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) {
      index++;
      continue;
    }
    if (["'", '"', '`', '['].includes(character)) {
      const end = character === '[' ? ']' : character;
      let value = character;
      index++;
      let terminated = false;
      while (index < source.length) {
        const current = source[index];
        value += current;
        index++;
        if (current === end) {
          if (end !== ']' && source[index] === end) {
            value += source[index];
            index++;
          } else {
            terminated = true;
            break;
          }
        }
      }
      if (!terminated) throw new Error('Unterminated quoted token in SQL table definition.');
      tokens.push({ value, wordLike: true });
      continue;
    }
    const word = source.slice(index).match(/^[a-zA-Z0-9_$\u0080-\uffff]+/)?.[0];
    if (word) {
      tokens.push({ value: sqliteCaseFold(word), wordLike: true });
      index += word.length;
      continue;
    }
    const operator = ['->>', '||', '<<', '>>', '<=', '>=', '<>', '!=', '==', '->']
      .find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      tokens.push({ value: operator, wordLike: false });
      index += operator.length;
      continue;
    }
    tokens.push({ value: character, wordLike: false });
    index++;
  }

  const canonicalTokens: typeof tokens = [];
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    if (normalizeDefaults && token.value === 'default') {
      let cursor = tokenIndex + 1;
      let openingParentheses = 0;
      while (tokens[cursor]?.value === '(') {
        openingParentheses++;
        cursor++;
      }
      if (openingParentheses > 0 && /^current_(?:date|time|timestamp)$/.test(tokens[cursor]?.value ?? '')) {
        const defaultValue = tokens[cursor];
        cursor++;
        let closingParentheses = 0;
        while (tokens[cursor]?.value === ')' && closingParentheses < openingParentheses) {
          closingParentheses++;
          cursor++;
        }
        if (closingParentheses === openingParentheses) {
          canonicalTokens.push(token, defaultValue);
          tokenIndex = cursor - 1;
          continue;
        }
      }
    }
    canonicalTokens.push(token);
  }

  let normalized = '';
  let previousWordLike = false;
  for (const token of canonicalTokens) {
    if (normalized && previousWordLike && token.wordLike) normalized += ' ';
    normalized += token.value;
    previousWordLike = token.wordLike;
  }
  return normalized.replace(/;$/, '');
}

function normalizeDefault(sql: unknown) {
  // Double-quoted SQLite defaults can be string literals; retain their content.
  return normalizeSql(sql, true);
}

function canonicalizeCatalog(catalog: DatabaseCatalog): DatabaseCatalog {
  const byName = (left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name, "en");
  return {
    tables: Object.fromEntries(Object.entries(catalog.tables).sort(([a], [b]) => a.localeCompare(b, "en")).map(([name, table]) => [name, {
      ...(table.sql === undefined ? {} : { sql: normalizeTableDefinition(table.sql) ?? '' }),
      columns: table.columns.map(column => ({ ...column, defaultValue: normalizeDefault(column.defaultValue) })),
      indexes: [...table.indexes].sort(byName),
      foreignKeys: [...table.foreignKeys].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "en")),
    }])),
    triggers: [...catalog.triggers].sort(byName),
    views: [...catalog.views].sort(byName),
  };
}

function sqliteAffinity(type: unknown) {
  const normalized = String(type ?? "").toUpperCase();
  if (normalized.includes("INT")) return "INTEGER";
  if (normalized.includes("CHAR") || normalized.includes("CLOB") || normalized.includes("TEXT")) return "TEXT";
  if (!normalized || normalized.includes("BLOB")) return "BLOB";
  if (normalized.includes("REAL") || normalized.includes("FLOA") || normalized.includes("DOUB")) return "REAL";
  return "NUMERIC";
}

function normalizeDrizzleSql(value: unknown, dialect: SQLiteSyncDialect) {
  const query = dialect.sqlToQuery(value as Parameters<SQLiteSyncDialect["sqlToQuery"]>[0]);
  if (query.params.length) throw new Error("Drizzle schema contract SQL must not contain unresolved parameters.");
  return normalizeSql(query.sql);
}

function normalizeDrizzleDefault(value: unknown, dialect: SQLiteSyncDialect) {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  const query = dialect.sqlToQuery(value as Parameters<SQLiteSyncDialect["sqlToQuery"]>[0]);
  if (query.params.length) throw new Error("Drizzle schema contract SQL must not contain unresolved parameters.");
  return normalizeDefault(query.sql);
}

function predicateFromIndexSql(sql: unknown, partial: boolean) {
  if (!partial) return null;
  const normalized = normalizeSql(sql);
  const match = normalized?.match(/\bwhere\s+(.+)$/);
  if (!match?.[1]) throw new Error("Partial index predicate is unavailable; refusing a partial=true-only comparison.");
  return normalizeTableDefinition(match[1], false);
}

function pragmaBoolean(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function indexDefinition(index: Record<string, unknown>, sql: unknown, rows: Array<Record<string, unknown>>) {
  const flag = (value: unknown) => [0, 1, '0', '1', false, true].some(candidate => candidate === value);
  if (!['c', 'u', 'pk'].includes(String(index.origin)) || !flag(index.unique) || !flag(index.partial)) {
    throw new Error('Index inventory metadata unavailable or malformed.');
  }
  const autoindex = ['u', 'pk'].includes(String(index.origin)) && String(index.name).startsWith('sqlite_autoindex_');
  // UNIQUE/PRIMARY KEY autoindexes have no CREATE INDEX statement (a WITHOUT
  // ROWID primary key has no sqlite_schema index row either). Their keys remain
  // mandatory; an explicit index must always supply its full definition.
  if (autoindex ? sql !== null : typeof sql !== 'string' || !sql.trim()) {
    throw new Error('Index definition metadata unavailable.');
  }
  const keys = rows.filter(row => pragmaBoolean(row.key))
    .sort((a, b) => Number(a.seqno) - Number(b.seqno));
  if (!keys.length || rows.some(row => !flag(row.key)) || keys.some((row, position) =>
    row.seqno == null || Number(row.seqno) !== position || !Number.isInteger(Number(row.cid)) || row.cid == null || Number(row.cid) < -2 ||
    !flag(row.desc) ||
    typeof row.coll !== 'string' || !row.coll ||
    (Number(row.cid) >= 0 ? typeof row.name !== 'string' : row.name !== null))) {
    throw new Error('Index key metadata unavailable or malformed.');
  }
  return {
    sql: normalizeTableDefinition(sql, false),
    keys: keys.map(row => ({ column: row.name as string | null, collation: sqliteCaseFold(String(row.coll)), descending: pragmaBoolean(row.desc) })),
  };
}

export function inspectDatabase(database: Database): DatabaseCatalog {
  const tableDefinitions = database.prepare(
    "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as Array<{ name: string; sql: string }>;
  const tableNames = tableDefinitions.map((row) => row.name);
  const tableSql = new Map(tableDefinitions.map((row) => [row.name, normalizeTableDefinition(row.sql) ?? '']));

  const tables = Object.fromEntries(tableNames.map((tableName) => {
    const escapedTableName = tableName.replaceAll("'", "''");
    const columns = (database.prepare(`PRAGMA table_info('${escapedTableName}')`).all() as Array<Record<string, unknown>>)
      .map((column) => ({
        name: String(column.name),
        type: String(column.type ?? "").toUpperCase(),
        notNull: pragmaBoolean(column.notnull) || Number(column.pk ?? 0) > 0,
        defaultValue: column.dflt_value == null ? null : String(column.dflt_value),
        primaryKey: Number(column.pk ?? 0),
      }));
    const indexes = (database.prepare(`PRAGMA index_list('${escapedTableName}')`).all() as Array<Record<string, unknown>>)
      .filter((index) => typeof index.name === "string")
      .map((index) => {
        const name = String(index.name);
        const escapedIndexName = name.replaceAll("'", "''");
        return {
          name,
          ...indexDefinition(index,
            database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?").get(name)?.sql ?? null,
            database.prepare(`PRAGMA index_xinfo('${escapedIndexName}')`).all() as Array<Record<string, unknown>>),
          unique: Boolean(index.unique),
          partial: Boolean(index.partial),
          columns: (database.prepare(`PRAGMA index_info('${escapedIndexName}')`).all() as Array<Record<string, unknown>>)
            .map((column) => String(column.name)),
          predicate: predicateFromIndexSql(
            database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?").get(name)?.sql,
            pragmaBoolean(index.partial),
          ),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, "en"));

    const foreignKeyRows = database.prepare(`PRAGMA foreign_key_list('${escapedTableName}')`).all() as Array<Record<string, unknown>>;
    const foreignKeys = [...new Set(foreignKeyRows.map((row) => Number(row.id)))].map((id) => {
      const rows = foreignKeyRows.filter((row) => Number(row.id) === id).sort((a, b) => Number(a.seq) - Number(b.seq));
      return {
        columns: rows.map((row) => String(row.from)),
        referencedTable: String(rows[0]?.table),
        referencedColumns: rows.map((row) => String(row.to)),
        onUpdate: String(rows[0]?.on_update ?? "no action").toLowerCase(),
        onDelete: String(rows[0]?.on_delete ?? "no action").toLowerCase(),
      };
    });
    return [tableName, { sql: tableSql.get(tableName) ?? '', columns, indexes, foreignKeys }];
  }));

  const triggers = (database.prepare(
    "SELECT name, tbl_name AS 'table', sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name",
  ).all() as Array<{ name: string; table: string; sql: string }>).map((trigger) => ({
    name: trigger.name,
    table: trigger.table,
    sql: normalizeSql(trigger.sql),
  }));

  const views = (database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'view' ORDER BY name").all() as Array<{ name: string; sql: string }>).map((view) => ({ name: view.name, sql: normalizeSql(view.sql) ?? "" }));
  return canonicalizeCatalog({ tables, triggers, views });
}

export function tableInfoSql(tableName: string): string {
  return `SELECT cid, name, type, "notnull", dflt_value, pk, dflt_value IS NULL AS default_is_null FROM pragma_table_info('${tableName.replaceAll("'", "''")}')`;
}

function pragmaDefault(column: Record<string, unknown>): string | null {
  if ('default_is_null' in column) {
    if (![0, 1, '0', '1'].some(value => value === column.default_is_null)) throw new Error('Malformed explicit default-null flag in remote schema output.');
    const flag = Number(column.default_is_null);
    if (flag === 1) {
      if (column.dflt_value != null && column.dflt_value !== 'null') throw new Error('Inconsistent absent-default metadata in remote schema output.');
      return null;
    }
    if (column.dflt_value == null) throw new Error('Missing declared default in remote schema output.');
  }
  return column.dflt_value == null ? null : String(column.dflt_value);
}

function remoteIndexText(row: Record<string, unknown>, field: 'index_sql' | 'column_name'): string | null {
  const flag = row[`${field}_is_null`];
  const value = row[field];
  if (![0, 1, '0', '1'].some(candidate => candidate === flag) ||
      (Number(flag) === 1 ? value !== null && value !== 'null' : typeof value !== 'string')) {
    throw new Error('Index null metadata unavailable or inconsistent.');
  }
  // Wrangler may serialize SQL NULL as the string "null". Only an explicit
  // SQL-derived flag distinguishes that from a real identifier named "null".
  return Number(flag) === 1 ? null : value as string;
}

export function catalogFromPragmaResults(tableNames: string[], results: PragmaResult[]): DatabaseCatalog {
  if (results.length !== tableNames.length * 4 + 1 || results.some((result) => !Array.isArray(result?.results))) {
    throw new Error(`Malformed or truncated Wrangler schema output: expected ${tableNames.length * 4 + 1} result sets, received ${results.length}.`);
  }
  const tables: DatabaseCatalog["tables"] = {};

  tableNames.forEach((name, index) => {
    const columns = results[index]?.results ?? [];
    const indexes = results[index + tableNames.length]?.results ?? [];
    const indexColumns = (results[index + (tableNames.length * 2)]?.results ?? []).map(row => ({
      ...row, index_sql: remoteIndexText(row, 'index_sql'), column_name: remoteIndexText(row, 'column_name'),
    })) as Array<Record<string, unknown>>;
    const foreignKeyRows = results[index + (tableNames.length * 3)]?.results ?? [];
    tables[name] = {
      columns: columns.map((column) => ({
        name: String(column.name),
        type: String(column.type ?? "").toUpperCase(),
        notNull: pragmaBoolean(column.notnull) || Number(column.pk ?? 0) > 0,
        defaultValue: pragmaDefault(column),
        primaryKey: Number(column.pk ?? 0),
      })),
      indexes: indexes
        .filter((entry) => typeof entry.name === "string")
        .map((entry) => ({
          name: String(entry.name),
          ...indexDefinition(entry,
            indexColumns.find(column => column.index_name === entry.name)?.index_sql,
            indexColumns.filter(column => column.index_name === entry.name).map(column => ({ ...column, name: column.column_name }))),
          unique: pragmaBoolean(entry.unique),
          partial: pragmaBoolean(entry.partial),
          columns: indexColumns
            .filter((column) => column.index_name === entry.name && pragmaBoolean(column.key))
            .sort((left, right) => Number(left.seqno) - Number(right.seqno))
            .map((column) => String(column.column_name)),
          predicate: predicateFromIndexSql(
            indexColumns.find((column) => column.index_name === entry.name)?.index_sql,
            pragmaBoolean(entry.partial),
          ),
        })),
      foreignKeys: [...new Set(foreignKeyRows.map((row) => Number(row.id)))].map((id) => {
        const rows = foreignKeyRows.filter((row) => Number(row.id) === id).sort((a, b) => Number(a.seq) - Number(b.seq));
        return { columns: rows.map((row) => String(row.from)), referencedTable: String(rows[0]?.table), referencedColumns: rows.map((row) => String(row.to)), onUpdate: String(rows[0]?.on_update ?? "no action").toLowerCase(), onDelete: String(rows[0]?.on_delete ?? "no action").toLowerCase() };
      }),
    };
  });
  const objects = results.at(-1)?.results ?? [];
  const tableDefinitions = new Map(objects
    .filter((row) => row.object_type === "table" && typeof row.name === "string" && typeof row.sql === "string")
    .map((row) => [String(row.name), normalizeTableDefinition(row.sql) ?? '']));
  for (const name of tableNames) {
    if (tableDefinitions.has(name)) tables[name].sql = tableDefinitions.get(name);
  }
  const triggers = objects.filter((row) => row.object_type === "trigger").map((row) => ({ name: String(row.name), table: String(row.table_name), sql: normalizeSql(row.sql) ?? "" }));
  const views = objects.filter((row) => row.object_type === "view").map((row) => ({ name: String(row.name), sql: normalizeSql(row.sql) ?? "" }));
  return canonicalizeCatalog({ tables, triggers, views });
}

export function diffDrizzleContract(contract: DrizzleContract, catalog: DatabaseCatalog) {
  const missingTables: string[] = [];
  const missingColumns: Record<string, string[]> = {};
  const invalidColumns: Record<string, Array<{ name: string; issues: string[] }>> = {};
  const unexpectedColumns: Record<string, string[]> = {};
  const missingIndexes: Record<string, string[]> = {};
  const invalidIndexes: Record<string, Array<{ name: string; issues: string[] }>> = {};
  const invalidForeignKeys: Record<string, string[]> = {};

  for (const [tableName, expected] of Object.entries(contract.tables)) {
    const actual = catalog.tables[tableName];
    if (!actual) {
      missingTables.push(tableName);
      continue;
    }

    const actualColumns = new Map(actual.columns.map((column) => [column.name, column]));
    const expectedColumns = new Map(expected.columns.map((column) => [column.name, column]));
    const missing = expected.columns.filter((column) => !actualColumns.has(column.name));
    const unexpected = actual.columns.filter((column) => !expectedColumns.has(column.name));
    const invalidColumnEntries = expected.columns.flatMap((expectedColumn) => {
      const actualColumn = actualColumns.get(expectedColumn.name);
      if (!actualColumn) return [];
      const issues: string[] = [];
      const actualAffinity = sqliteAffinity(actualColumn.type);
      if (expectedColumn.affinity !== actualAffinity) issues.push(`expected affinity ${expectedColumn.affinity}; received ${actualAffinity}`);
      if (expectedColumn.notNull !== actualColumn.notNull) issues.push(expectedColumn.notNull ? "expected NOT NULL" : "expected nullable");
      const actualDefault = normalizeDefault(actualColumn.defaultValue);
      if (expectedColumn.defaultValue !== actualDefault) {
        issues.push(`expected default ${expectedColumn.defaultValue ?? "no default"}; received ${actualDefault ?? "no default"}`);
      }
      if (expectedColumn.primaryKey !== actualColumn.primaryKey) {
        issues.push(`expected primary-key position ${expectedColumn.primaryKey}; received ${actualColumn.primaryKey}`);
      }
      return issues.length ? [{ name: expectedColumn.name, issues }] : [];
    });
    const actualIndexes = new Map(actual.indexes.map((index) => [index.name, index]));
    const matchedIndex = (expectedIndex: (typeof expected.indexes)[number]) => expectedIndex.matchByColumns
      ? actual.indexes.find((index) =>
          index.unique === expectedIndex.unique &&
          index.partial === expectedIndex.partial &&
          JSON.stringify(index.columns) === JSON.stringify(expectedIndex.columns))
      : actualIndexes.get(expectedIndex.name);
    const indexes = expected.indexes.filter((index) => !matchedIndex(index));
    const invalid = expected.indexes.flatMap((expectedIndex) => {
      const actualIndex = matchedIndex(expectedIndex);
      if (!actualIndex) return [];
      const issues: string[] = [];
      if (typeof expectedIndex.unique === "boolean" && expectedIndex.unique !== actualIndex.unique) {
        issues.push(expectedIndex.unique ? "expected unique" : "expected non-unique");
      }
      if (typeof expectedIndex.partial === "boolean" && expectedIndex.partial !== actualIndex.partial) {
        issues.push(expectedIndex.partial ? "expected partial" : "expected non-partial");
      }
      if (JSON.stringify(expectedIndex.columns) !== JSON.stringify(actualIndex.columns)) {
        issues.push(`expected columns ${expectedIndex.columns.join(", ")}; received ${actualIndex.columns.join(", ")}`);
      }
      if ('sql' in expectedIndex && (expectedIndex.sql === undefined || expectedIndex.sql !== actualIndex.sql)) {
        issues.push('index definition differs or is unavailable');
      }
      if ('keys' in expectedIndex && (!expectedIndex.keys?.length || JSON.stringify(expectedIndex.keys) !== JSON.stringify(actualIndex.keys))) {
        issues.push('index key semantics differ or are unavailable');
      }
      if (expectedIndex.partial) {
        if (!expectedIndex.predicate || !actualIndex.predicate) {
          issues.push("partial index predicate unavailable");
        } else if (normalizeTableDefinition(expectedIndex.predicate, false) !== normalizeTableDefinition(actualIndex.predicate, false)) {
          issues.push(`expected predicate ${normalizeSql(expectedIndex.predicate)}; received ${normalizeSql(actualIndex.predicate)}`);
        }
      }
      return issues.length ? [{ name: expectedIndex.name, issues }] : [];
    });

    if (missing.length) missingColumns[tableName] = missing.map((column) => column.name).sort();
    if (unexpected.length) unexpectedColumns[tableName] = unexpected.map((column) => column.name).sort();
    if (invalidColumnEntries.length) invalidColumns[tableName] = invalidColumnEntries;
    if (indexes.length) missingIndexes[tableName] = indexes.map((index) => index.name).sort();
    if (invalid.length) invalidIndexes[tableName] = invalid;
    const relationKey = (relation: DatabaseCatalog["tables"][string]["foreignKeys"][number]) => JSON.stringify(relation);
    const actualRelations = new Set((actual.foreignKeys ?? []).map(relationKey));
    const missingRelations = (expected.foreignKeys ?? []).filter((relation) => !actualRelations.has(relationKey(relation)));
    const allowedRelations = contract.allowedForeignKeys?.[tableName] ?? [];
    const unexpectedRelations = contract.strictObjects
      ? (actual.foreignKeys ?? []).filter((relation) => ![...(expected.foreignKeys ?? []), ...allowedRelations].some((candidate) => relationKey(candidate) === relationKey(relation)))
      : [];
    if (missingRelations.length || unexpectedRelations.length) invalidForeignKeys[tableName] = ["foreign-key relations differ"];
  }

  const verdict = missingTables.length || Object.keys(missingColumns).length || Object.keys(invalidColumns).length ||
    Object.keys(unexpectedColumns).length || Object.keys(missingIndexes).length || Object.keys(invalidIndexes).length || Object.keys(invalidForeignKeys).length
    ? "fail"
    : "pass";

  return { missingTables, missingColumns, invalidColumns, unexpectedColumns, missingIndexes, invalidIndexes, invalidForeignKeys, verdict } as const;
}

export function diffRuntimeSchema(schema: Record<string, unknown>, catalog: DatabaseCatalog) {
  return diffDrizzleContract(buildDrizzleContract(schema), catalog);
}

export function validateContractCorrection({ contract, migratedCatalog, changedMigrationFiles, appliedMigrationEvidence }: { contract: DrizzleContract; migratedCatalog: DatabaseCatalog; changedMigrationFiles: string[]; appliedMigrationEvidence: string[] }) {
  if (changedMigrationFiles.length) throw new Error("Contract correction cannot include a new or modified migration.");
  const migrations = listMigrationFiles().map((migration) => migration.name);
  if (!migrations.every((name) => appliedMigrationEvidence.includes(name))) throw new Error("Contract correction requires evidence that the matching migration history was already applied.");
  const diff = diffDrizzleContract(contract, migratedCatalog);
  if (diff.verdict !== "pass") throw new Error("Contract correction cannot introduce database state absent from applied migrations.");
  return { verdict: "pass", migrationRange: { from: migrations[0], to: migrations.at(-1) } };
}

export function contractFingerprint(contract: DrizzleContract) {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}

export function compareDatabaseSchemas(expected: DatabaseCatalog, actual: DatabaseCatalog) {
  expected = canonicalizeCatalog(expected);
  actual = canonicalizeCatalog(actual);
  const differences: string[] = [];
  const tableNames = [...new Set([...Object.keys(expected.tables), ...Object.keys(actual.tables)])].sort();

  for (const tableName of tableNames) {
    if (!expected.tables[tableName]) {
      differences.push(`unexpected table ${tableName}`);
      continue;
    }
    if (!actual.tables[tableName]) {
      differences.push(`missing table ${tableName}`);
      continue;
    }
    if (JSON.stringify(expected.tables[tableName]) !== JSON.stringify(actual.tables[tableName])) {
      differences.push(`table ${tableName} differs`);
    }
  }

  if (JSON.stringify(expected.triggers) !== JSON.stringify(actual.triggers)) {
    differences.push("triggers differ");
  }
  if (JSON.stringify(expected.views) !== JSON.stringify(actual.views)) differences.push("views differ");

  return { differences, verdict: differences.length ? "fail" : "pass" } as const;
}

export function generateSchemaSnapshot(database: Database) {
  const statements = (database.prepare(`
    SELECT type, name, sql
    FROM sqlite_schema
    WHERE sql IS NOT NULL
      AND name NOT LIKE 'sqlite_%'
    ORDER BY CASE type WHEN 'table' THEN 1 WHEN 'index' THEN 2 WHEN 'trigger' THEN 3 ELSE 4 END, name
  `).all() as Array<{ type: string; name: string; sql: string }>);

  return [
    "-- GENERATED FILE. DO NOT EDIT BY HAND.",
    "-- Derived by scripts/data/generate-schema-snapshot.ts from the complete Wrangler migration chain.",
    "",
    ...statements.flatMap((entry) => [entry.sql.replace(/;\s*$/, "") + ";", ""]),
  ].join("\n");
}
import { createHash } from "node:crypto";
