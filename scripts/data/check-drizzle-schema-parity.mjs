import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { normalizeSqlFormatting } from "../check-production-d1-schema-lib.mjs";
import { execTool } from "../lib/run-tool.mjs";
import { readSqlOnlySchema } from "../lib/sql-only-schema.mjs";
import { parseWranglerResultSets } from "../lib/wrangler-json.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const database = "serp-checklists-db";

function run(tool, args, options = {}) {
  return execTool(tool, args, {
    cwd: repoRoot,
    env: { ...process.env, CI: "1" },
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function wranglerJson(persistPath, statement) {
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

function wranglerBatch(persistPath, statements) {
  const rows = [];
  for (let start = 0; start < statements.length; start += D1_MAX_COMPOUND_SELECT_TERMS) {
    rows.push(...wranglerUnion(persistPath, statements.slice(start, start + D1_MAX_COMPOUND_SELECT_TERMS)));
  }
  return rows;
}

function wranglerUnion(persistPath, statements) {
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

function normalizeComparableSql(value) {
  return normalizeSqlFormatting(value)
    .replace(/\bfalse\b/gi, "0")
    .replace(/\btrue\b/gi, "1")
    .toLowerCase();
}

function normalizeDefault(value) {
  let normalized = normalizeComparableSql(value);
  while (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized.replace(/\s*([(),*])\s*/g, "$1");
}

function extractChecks(createSql) {
  const matches = [];
  const expression = /\bcheck\s*\(([^;]+?)\)(?=\s*(?:,|\)))/gi;
  for (const match of String(createSql ?? "").matchAll(expression)) {
    matches.push(normalizeComparableSql(match[1]).replace(/^\w+\./, ""));
  }
  return matches.sort();
}

function indexWhere(createSql) {
  const match = String(createSql ?? "").match(/\bwhere\b([\s\S]+)$/i);
  return match ? normalizeComparableSql(match[1]).replace(/\b\w+\./g, "") : "";
}

async function loadCatalog(persistPath) {
  const objects = wranglerJson(
    persistPath,
    "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,tbl_name,name;",
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
  const catalog = { tables: {}, triggers: [] };

  const quoted = (value) => value.replaceAll("'", "''");
  const columnsByTable = Object.groupBy(
    wranglerBatch(
      persistPath,
      tables.map((table) => `SELECT '${quoted(table)}' AS source_table, * FROM pragma_table_info('${quoted(table)}');`),
    ),
    ({ source_table: table }) => table,
  );
  const foreignKeysByTable = Object.groupBy(
    wranglerBatch(
      persistPath,
      tables.map((table) => `SELECT '${quoted(table)}' AS source_table, * FROM pragma_foreign_key_list('${quoted(table)}');`),
    ),
    ({ source_table: table }) => table,
  );
  const indexesByTable = Object.groupBy(
    wranglerBatch(
      persistPath,
      tables.map((table) => `SELECT '${quoted(table)}' AS source_table, * FROM pragma_index_list('${quoted(table)}');`),
    ),
    ({ source_table: table }) => table,
  );
  const indexNames = Object.values(indexesByTable).flat().map(({ name }) => name);
  const indexColumnsByName = Object.groupBy(
    wranglerBatch(
      persistPath,
      indexNames.map((name) => `SELECT '${quoted(name)}' AS source_index, * FROM pragma_index_info('${quoted(name)}');`),
    ),
    ({ source_index: indexName }) => indexName,
  );

  for (const table of tables) {
    const columns = (columnsByTable[table] ?? [])
      .map((column) => ({
        name: column.name,
        type: String(column.type).toUpperCase(),
        notNull: Number(column.notnull),
        default: normalizeDefault(column.dflt_value),
        primaryKeyOrder: Number(column.pk),
      }));
    const foreignKeys = (foreignKeysByTable[table] ?? [])
      .map((foreignKey) => ({
        from: foreignKey.from,
        table: foreignKey.table,
        to: foreignKey.to,
        onUpdate: String(foreignKey.on_update).toLowerCase(),
        onDelete: String(foreignKey.on_delete).toLowerCase(),
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const indexes = [];
    for (const row of indexesByTable[table] ?? []) {
      const indexName = row.name;
      const indexColumns = (indexColumnsByName[indexName] ?? []).map(({ name }) => name);
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

function indexSignature(index) {
  return JSON.stringify({
    columns: index.columns,
    unique: index.unique,
    partial: index.partial,
    where: index.where,
  });
}

export function compareCatalogs(authoritative, generated) {
  assert.deepEqual(Object.keys(generated.tables).sort(), Object.keys(authoritative.tables).sort(), "table set differs");

  for (const [table, expected] of Object.entries(authoritative.tables)) {
    const actual = generated.tables[table];
    assert.deepEqual(actual.columns, expected.columns, `${table}: column contract differs`);
    assert.deepEqual(actual.foreignKeys, expected.foreignKeys, `${table}: foreign keys differ`);
    assert.deepEqual(actual.checks, expected.checks, `${table}: checks differ`);

    const expectedNamed = expected.indexes.filter(({ origin }) => origin === "c");
    const actualByName = new Map(actual.indexes.map((index) => [index.name, index]));
    for (const index of expectedNamed) {
      assert.equal(actualByName.has(index.name), true, `${table}: missing named index ${index.name}`);
      assert.equal(
        indexSignature(actualByName.get(index.name)),
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

function verifyNegativeControls(authoritative, generated) {
  const firstTable = Object.keys(generated.tables).find((table) => generated.tables[table].foreignKeys.length > 0);
  const controls = [
    ["nullability", (copy) => { copy.tables.users.columns[1].notNull = 0; }],
    ["default", (copy) => { copy.tables.users.columns.find(({ name }) => name === "email_verified").default = "1"; }],
    ["index", (copy) => { copy.tables.templates.indexes = copy.tables.templates.indexes.filter(({ name }) => name !== "idx_templates_owner"); }],
    ["foreign key", (copy) => { copy.tables[firstTable].foreignKeys.pop(); }],
    ["check", (copy) => { copy.tables.sitemap_revisions.checks = []; }],
  ];
  for (const [name, mutate] of controls) {
    const copy = structuredClone(generated);
    mutate(copy);
    assert.throws(() => compareCatalogs(authoritative, copy), undefined, `${name} negative control did not fail`);
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
    assert.equal(sqlFiles.length, 1, "expected exactly one generated baseline SQL file");
    const generatedSqlPath = path.join(generatedOutput, sqlFiles[0]);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
