import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { getTableConfig, SQLiteSyncDialect } from "drizzle-orm/sqlite-core";

type Database = InstanceType<typeof DatabaseSync>;

export interface DrizzleContract {
  tables: Record<string, {
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
    }>;
  }>;
}

export interface DatabaseCatalog {
  tables: Record<string, {
    columns: Array<{ name: string; type: string; notNull: boolean; defaultValue: string | null; primaryKey: number }>;
    indexes: Array<{ name: string; unique: boolean; partial: boolean; columns: string[]; predicate: string | null }>;
  }>;
  triggers: Array<{ name: string; table: string; sql: string }>;
}

interface PragmaResult {
  results?: Array<Record<string, unknown>>;
}

const migrationsDirectory = fileURLToPath(new URL("../../db/migrations/", import.meta.url));

export function listMigrationFiles() {
  return readdirSync(migrationsDirectory)
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right, "en"))
    .map((name) => ({
      name,
      sql: readFileSync(new URL(`../../db/migrations/${name}`, import.meta.url), "utf8"),
    }));
}

export function replayMigrations(options: { through?: string } = {}) {
  const database = new DatabaseSync(":memory:");
  const migrations = listMigrationFiles();
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
        .map((column) => ({
          name: column.uniqueName,
          unique: true,
          partial: false,
          columns: [column.name],
          matchByColumns: true,
          predicate: null,
        }));
      const tableUniqueIndexes = table.uniqueConstraints.map((constraint) => ({
        name: constraint.config.name,
        unique: true,
        partial: false,
        columns: constraint.config.columns.map((column) => column.name),
        matchByColumns: true,
        predicate: null,
      }));
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
      },
    ];
    })),
  };
}

export function buildCatalogContract(catalog: DatabaseCatalog): DrizzleContract {
  return {
    tables: Object.fromEntries(Object.entries(catalog.tables).map(([name, table]) => [name, {
      columns: table.columns.map((column) => ({
        name: column.name,
        affinity: sqliteAffinity(column.type),
        notNull: column.notNull,
        defaultValue: normalizeSql(column.defaultValue),
        primaryKey: column.primaryKey,
      })),
      indexes: table.indexes.map((index) => ({
        name: index.name,
        unique: index.unique,
        partial: index.partial,
        columns: index.columns,
        predicate: index.predicate,
      })),
    }])),
  };
}

function normalizeSql(sql: unknown): string | null {
  if (sql == null) return null;
  let normalized = String(sql ?? "")
    .split(/('(?:''|[^'])*')/)
    .map((part, index) => index % 2
      ? part
      : part
          .replaceAll("`", "")
          .replaceAll('"', "")
          .replaceAll("[", "")
          .replaceAll("]", "")
          .toLowerCase())
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "");
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
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
  return normalizeDrizzleSql(value, dialect);
}

function predicateFromIndexSql(sql: unknown, partial: boolean) {
  if (!partial) return null;
  const normalized = normalizeSql(sql);
  const match = normalized?.match(/\bwhere\s+(.+)$/);
  if (!match?.[1]) throw new Error("Partial index predicate is unavailable; refusing a partial=true-only comparison.");
  return match[1].trim();
}

function pragmaBoolean(value: unknown) {
  return value === true || value === 1 || value === "1";
}

export function inspectDatabase(database: Database): DatabaseCatalog {
  const tableNames = (database.prepare(
    "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all() as Array<{ name: string }>).map((row) => row.name);

  const tables = Object.fromEntries(tableNames.map((tableName) => {
    const escapedTableName = tableName.replaceAll("'", "''");
    const columns = (database.prepare(`PRAGMA table_info('${escapedTableName}')`).all() as Array<Record<string, unknown>>)
      .map((column) => ({
        name: String(column.name),
        type: String(column.type ?? "").toUpperCase(),
        notNull: pragmaBoolean(column.notnull) || Number(column.pk ?? 0) > 0,
        defaultValue: column.dflt_value == null ? null : normalizeSql(column.dflt_value),
        primaryKey: Number(column.pk ?? 0),
      }));
    const indexes = (database.prepare(`PRAGMA index_list('${escapedTableName}')`).all() as Array<Record<string, unknown>>)
      .filter((index) => typeof index.name === "string")
      .map((index) => {
        const name = String(index.name);
        const escapedIndexName = name.replaceAll("'", "''");
        return {
          name,
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

    return [tableName, { columns, indexes }];
  }));

  const triggers = (database.prepare(
    "SELECT name, tbl_name AS 'table', sql FROM sqlite_schema WHERE type = 'trigger' ORDER BY name",
  ).all() as Array<{ name: string; table: string; sql: string }>).map((trigger) => ({
    name: trigger.name,
    table: trigger.table,
    sql: normalizeSql(trigger.sql),
  }));

  return { tables, triggers };
}

export function catalogFromPragmaResults(tableNames: string[], results: PragmaResult[]): DatabaseCatalog {
  if (results.length !== tableNames.length * 3 || results.some((result) => !Array.isArray(result?.results))) {
    throw new Error(`Malformed or truncated Wrangler schema output: expected ${tableNames.length * 3} result sets, received ${results.length}.`);
  }
  const tables: DatabaseCatalog["tables"] = {};

  tableNames.forEach((name, index) => {
    const columns = results[index]?.results ?? [];
    const indexes = results[index + tableNames.length]?.results ?? [];
    const indexColumns = results[index + (tableNames.length * 2)]?.results ?? [];
    tables[name] = {
      columns: columns.map((column) => ({
        name: String(column.name),
        type: String(column.type ?? "").toUpperCase(),
        notNull: pragmaBoolean(column.notnull) || Number(column.pk ?? 0) > 0,
        defaultValue: column.dflt_value == null || String(column.dflt_value).toLowerCase() === "null"
          ? null
          : String(column.dflt_value),
        primaryKey: Number(column.pk ?? 0),
      })),
      indexes: indexes
        .filter((entry) => typeof entry.name === "string")
        .map((entry) => ({
          name: String(entry.name),
          unique: pragmaBoolean(entry.unique),
          partial: pragmaBoolean(entry.partial),
          columns: indexColumns
            .filter((column) => column.index_name === entry.name)
            .sort((left, right) => Number(left.seqno) - Number(right.seqno))
            .map((column) => String(column.column_name)),
          predicate: predicateFromIndexSql(
            indexColumns.find((column) => column.index_name === entry.name)?.index_sql,
            pragmaBoolean(entry.partial),
          ),
        })),
    };
  });

  return { tables, triggers: [] };
}

export function diffDrizzleContract(contract: DrizzleContract, catalog: DatabaseCatalog) {
  const missingTables: string[] = [];
  const missingColumns: Record<string, string[]> = {};
  const invalidColumns: Record<string, Array<{ name: string; issues: string[] }>> = {};
  const unexpectedColumns: Record<string, string[]> = {};
  const missingIndexes: Record<string, string[]> = {};
  const invalidIndexes: Record<string, Array<{ name: string; issues: string[] }>> = {};

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
      const actualDefault = normalizeSql(actualColumn.defaultValue);
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
      if (expectedIndex.partial) {
        if (!expectedIndex.predicate || !actualIndex.predicate) {
          issues.push("partial index predicate unavailable");
        } else if (normalizeSql(expectedIndex.predicate) !== normalizeSql(actualIndex.predicate)) {
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
  }

  const verdict = missingTables.length || Object.keys(missingColumns).length || Object.keys(invalidColumns).length ||
    Object.keys(unexpectedColumns).length || Object.keys(missingIndexes).length || Object.keys(invalidIndexes).length
    ? "fail"
    : "pass";

  return { missingTables, missingColumns, invalidColumns, unexpectedColumns, missingIndexes, invalidIndexes, verdict } as const;
}

export function diffRuntimeSchema(schema: Record<string, unknown>, catalog: DatabaseCatalog) {
  return diffDrizzleContract(buildDrizzleContract(schema), catalog);
}

export function compareDatabaseSchemas(expected: DatabaseCatalog, actual: DatabaseCatalog) {
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
