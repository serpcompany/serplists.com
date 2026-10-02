import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { z } from "zod";
import { normalizeSqlFormatting } from "../check-production-d1-schema-lib";
import { execTool, type ToolName } from "../lib/run-tool";
import { readSqlOnlySchema } from "../lib/sql-only-schema";
import { parseWranglerResultSets } from "../lib/wrangler-json";

type ColumnContract = { name: string; type: string; notNull: number; default: string; primaryKeyOrder: number };
type ForeignKeyContract = { from: unknown; table: unknown; to: unknown; onUpdate: string; onDelete: string };
type IndexContract = { name: string; columns: unknown[]; unique: boolean; origin: unknown; partial: boolean; where: string };
type TableContract = { columns: ColumnContract[]; foreignKeys: ForeignKeyContract[]; indexes: IndexContract[]; checks: string[] };
type TriggerContract = { name: string; table: unknown; definition: string };
type Catalog = { tables: Record<string, TableContract>; triggers: TriggerContract[] };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const database = "serp-checklists-db";

const schemaObjectSchema = z.object({ type: z.unknown(), name: z.string(), tbl_name: z.unknown(), sql: z.unknown() });
const columnRowSchema = z.object({
  source_table: z.string(),
  name: z.string(),
  type: z.unknown(),
  notnull: z.unknown(),
  dflt_value: z.unknown(),
  pk: z.unknown(),
});
const foreignKeyRowSchema = z.object({
  source_table: z.string(),
  from: z.unknown(),
  table: z.unknown(),
  to: z.unknown(),
  on_update: z.unknown(),
  on_delete: z.unknown(),
});
const indexRowSchema = z.object({
  source_table: z.string(),
  name: z.string(),
  unique: z.unknown(),
  origin: z.unknown(),
  partial: z.unknown(),
});
const indexColumnRowSchema = z.object({ source_index: z.string(), name: z.unknown() });

function run(tool: ToolName, args: string[], options: { capture?: boolean } = {}): string {
  return execTool(tool, args, {
    cwd: repoRoot,
    env: { ...process.env, CI: "1" },
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function wranglerJson(persistPath: string, statement: string): unknown[] {
  const output = run(
    "wrangler",
    [
      "d1",
      "execute",
      database,
      "--local",
      "--persist-to",
      persistPath,
      "--json",
      "--command",
      statement,
    ],
    { capture: true },
  );
  return parseWranglerResultSets(output)[0]?.results ?? [];
}

const D1_MAX_COMPOUND_SELECT_TERMS = 5;

function wranglerBatch(persistPath: string, statements: readonly string[]): unknown[] {
  const rows: unknown[] = [];
  for (let start = 0; start < statements.length; start += D1_MAX_COMPOUND_SELECT_TERMS) {
    rows.push(...wranglerUnion(persistPath, statements.slice(start, start + D1_MAX_COMPOUND_SELECT_TERMS)));
  }
  return rows;
}

function wranglerUnion(persistPath: string, statements: readonly string[]): unknown[] {
  const output = run(
    "wrangler",
    [
      "d1",
      "execute",
      database,
      "--local",
      "--persist-to",
      persistPath,
      "--json",
      "--command",
      statements.map((statement) => statement.trim().replace(/;$/, "")).join(" UNION ALL "),
    ],
    { capture: true },
  );
  return parseWranglerResultSets(output).flatMap(({ results }) => results ?? []);
}

function groupedBy<Row>(rows: readonly unknown[], rowSchema: z.ZodType<Row>, keyOf: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();
  for (const row of z.array(rowSchema).parse(rows)) {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

function normalizeComparableSql(value: unknown): string {
  return normalizeSqlFormatting(value)
    .replace(/\bfalse\b/gi, "0")
    .replace(/\btrue\b/gi, "1")
    .toLowerCase();
}

function normalizeDefault(value: unknown): string {
  let normalized = normalizeComparableSql(value);
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized.replace(/\s*([(),*])\s*/g, "$1");
}

function extractChecks(createSql: unknown): string[] {
  const matches: string[] = [];
  const expression = /\bcheck\s*\(([^;]+?)\)(?=\s*(?:,|\)))/gi;
  for (const match of String(createSql ?? "").matchAll(expression)) {
    matches.push(normalizeComparableSql(match[1]).replace(/^\w+\./, ""));
  }
  return matches.sort();
}

function indexWhere(createSql: unknown): string {
  const match = String(createSql ?? "").match(/\bwhere\b([\s\S]+)$/i);
  return match ? normalizeComparableSql(match[1]).replace(/\b\w+\./g, "") : "";
}

async function loadCatalog(persistPath: string): Promise<Catalog> {
  const objects = z.array(schemaObjectSchema).parse(
    wranglerJson(
      persistPath,
      "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,tbl_name,name;",
    ),
  );
  const tables = objects
    .filter(({ type, name }) => type === "table" && !name.startsWith("_cf_") && name !== "d1_migrations")
    .map(({ name }) => name)
    .sort();
  const tableSql = new Map(
    objects.filter(({ type }) => type === "table").map(({ name, sql }) => [name, sql]),
  );
  const indexSql = new Map(
    objects.filter(({ type }) => type === "index").map(({ name, sql }) => [name, sql]),
  );
  const catalog: Catalog = { tables: {}, triggers: [] };

  const quoted = (value: string) => value.replaceAll("'", "''");
  const columnsByTable = groupedBy(
    wranglerBatch(
      persistPath,
      tables.map((table) => `SELECT '${quoted(table)}' AS source_table, * FROM pragma_table_info('${quoted(table)}');`),
    ),
    columnRowSchema,
    ({ source_table: table }) => table,
  );
  const foreignKeysByTable = groupedBy(
    wranglerBatch(
      persistPath,
      tables.map((table) => `SELECT '${quoted(table)}' AS source_table, * FROM pragma_foreign_key_list('${quoted(table)}');`),
    ),
    foreignKeyRowSchema,
    ({ source_table: table }) => table,
  );
  const indexesByTable = groupedBy(
    wranglerBatch(
      persistPath,
      tables.map((table) => `SELECT '${quoted(table)}' AS source_table, * FROM pragma_index_list('${quoted(table)}');`),
    ),
    indexRowSchema,
    ({ source_table: table }) => table,
  );
  const indexNames = [...indexesByTable.values()].flat().map(({ name }) => name);
  const indexColumnsByName = groupedBy(
    wranglerBatch(
      persistPath,
      indexNames.map((name) => `SELECT '${quoted(name)}' AS source_index, * FROM pragma_index_info('${quoted(name)}');`),
    ),
    indexColumnRowSchema,
    ({ source_index: indexName }) => indexName,
  );

  for (const table of tables) {
    const columns = (columnsByTable.get(table) ?? [])
      .map((column) => ({
        name: column.name,
        type: String(column.type).toUpperCase(),
        notNull: Number(column.notnull),
        default: normalizeDefault(column.dflt_value),
        primaryKeyOrder: Number(column.pk),
      }));
    const foreignKeys = (foreignKeysByTable.get(table) ?? [])
      .map((foreignKey) => ({
        from: foreignKey.from,
        table: foreignKey.table,
        to: foreignKey.to,
        onUpdate: String(foreignKey.on_update).toLowerCase(),
        onDelete: String(foreignKey.on_delete).toLowerCase(),
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const indexes: IndexContract[] = [];
    for (const row of indexesByTable.get(table) ?? []) {
      const indexName = row.name;
      const indexColumns = (indexColumnsByName.get(indexName) ?? []).map(({ name }) => name);
      indexes.push({
        name: indexName,
        columns: indexColumns,
        unique: Number(row.unique) === 1,
        origin: row.origin,
        partial: Number(row.partial) === 1,
        where: indexWhere(indexSql.get(indexName)),
      });
    }
    assert.ok(columns.length > 0, `${table}: no columns loaded; the schema query returned nothing`);
    catalog.tables[table] = {
      columns,
      foreignKeys,
      indexes,
      checks: extractChecks(tableSql.get(table)),
    };
  }
  assert.ok(tables.length > 0, "no tables loaded; the schema query returned nothing");

  catalog.triggers = objects
    .filter(({ type }) => type === "trigger")
    .map(({ name, tbl_name: table, sql }) => ({ name, table, definition: normalizeSqlFormatting(sql) }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return catalog;
}

function indexSignature(index: IndexContract): string {
  return JSON.stringify({
    columns: index.columns,
    unique: index.unique,
    partial: index.partial,
    where: index.where,
  });
}

function tableIn(catalog: Catalog, table: string): TableContract {
  const contract = catalog.tables[table];
  if (!contract) throw new Error(`${table}: missing from the catalog`);
  return contract;
}

export function compareCatalogs(authoritative: Catalog, generated: Catalog): void {
  assert.deepEqual(Object.keys(generated.tables).sort(), Object.keys(authoritative.tables).sort(), "table set differs");

  for (const [table, expected] of Object.entries(authoritative.tables)) {
    const actual = tableIn(generated, table);
    assert.deepEqual(actual.columns, expected.columns, `${table}: column contract differs`);
    assert.deepEqual(actual.foreignKeys, expected.foreignKeys, `${table}: foreign keys differ`);
    assert.deepEqual(actual.checks, expected.checks, `${table}: checks differ`);

    const expectedNamed = expected.indexes.filter(({ origin }) => origin === "c");
    const actualByName = new Map(actual.indexes.map((index) => [index.name, index]));
    for (const index of expectedNamed) {
      const actualIndex = actualByName.get(index.name);
      assert.ok(actualIndex, `${table}: missing named index ${index.name}`);
      assert.equal(
        indexSignature(actualIndex),
        indexSignature(index),
        `${table}: named index ${index.name} differs`,
      );
    }

    const expectedConstraintSignatures = expected.indexes
      .filter(({ origin }) => origin !== "c")
      .map(indexSignature)
      .sort();
    const actualExtraSignatures = actual.indexes
      .filter(({ name }) => !expectedNamed.some((expectedIndex) => expectedIndex.name === name))
      .map(indexSignature)
      .sort();
    assert.deepEqual(actualExtraSignatures, expectedConstraintSignatures, `${table}: unique/primary index contract differs`);
  }
}

function columnIn(contract: TableContract, matches: (column: ColumnContract, index: number) => boolean, what: string): ColumnContract {
  const column = contract.columns.find(matches);
  if (!column) throw new Error(`The negative control needs ${what}`);
  return column;
}

function verifyNegativeControls(authoritative: Catalog, generated: Catalog): void {
  const firstTable = Object.keys(generated.tables).find((table) => tableIn(generated, table).foreignKeys.length > 0);
  const controls: ReadonlyArray<readonly [string, (copy: Catalog) => void]> = [
    ["nullability", (copy) => { columnIn(tableIn(copy, "users"), (_column, index) => index === 1, "a second users column").notNull = 0; }],
    ["default", (copy) => { columnIn(tableIn(copy, "users"), ({ name }) => name === "email_verified", "users.email_verified").default = "1"; }],
    ["index", (copy) => {
      const templates = tableIn(copy, "templates");
      templates.indexes = templates.indexes.filter(({ name }) => name !== "idx_templates_owner");
    }],
    ["foreign key", (copy) => {
      if (firstTable === undefined) throw new Error("The negative control needs a table with a foreign key");
      tableIn(copy, firstTable).foreignKeys.pop();
    }],
    ["check", (copy) => { tableIn(copy, "sitemap_revisions").checks = []; }],
  ];
  for (const [name, mutate] of controls) {
    const copy = structuredClone(generated);
    mutate(copy);
    assert.throws(() => compareCatalogs(authoritative, copy), Error, `${name} negative control did not fail`);
  }
}

async function main() {
  const root = mkdtempSync(path.join(tmpdir(), "serplists-drizzle-parity-"));
  const authoritativePersist = path.join(root, "wrangler");
  const generatedPersist = path.join(root, "drizzle");
  const generatedOutput = path.join(root, "generated");

  try {
    run("wrangler", [
      "d1", "migrations", "apply", database,
      "--local", "--persist-to", authoritativePersist,
    ], { capture: true });
    run("drizzle-kit", [
      "generate",
      "--dialect", "sqlite",
      "--schema", "./db/schema/index.ts",
      "--out", generatedOutput,
    ], { capture: true });
    const sqlFiles = readdirSync(generatedOutput).filter((name) => name.endsWith(".sql"));
    const [sqlFile] = sqlFiles;
    assert.equal(sqlFiles.length, 1, "expected exactly one generated baseline SQL file");
    assert.ok(sqlFile, "expected exactly one generated baseline SQL file");
    const generatedSqlPath = path.join(generatedOutput, sqlFile);
    assert.ok(readFileSync(generatedSqlPath, "utf8").includes("CREATE TABLE"), "generated baseline SQL is empty");
    run("wrangler", [
      "d1", "execute", database,
      "--local", "--persist-to", generatedPersist, "--file", generatedSqlPath,
    ], { capture: true });

    const authoritative = await loadCatalog(authoritativePersist);
    const generated = await loadCatalog(generatedPersist);
    compareCatalogs(authoritative, generated);

    const manifest = readSqlOnlySchema();
    assert.deepEqual(authoritative.triggers, manifest.triggers, "SQL-only trigger manifest differs from migration replay");
    assert.equal(generated.triggers.length, 0, "Drizzle baseline unexpectedly generated triggers");
    verifyNegativeControls(authoritative, generated);

    const namedIndexCount = Object.values(authoritative.tables)
      .flatMap(({ indexes }) => indexes)
      .filter(({ origin }) => origin === "c").length;
    const foreignKeyCount = Object.values(authoritative.tables)
      .flatMap(({ foreignKeys }) => foreignKeys).length;
    console.log(
      `Drizzle schema parity ok: ${Object.keys(authoritative.tables).length} tables, `
      + `${namedIndexCount} named indexes, ${foreignKeyCount} foreign keys, `
      + `${authoritative.triggers.length} SQL-only triggers.`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
