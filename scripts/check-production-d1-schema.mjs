import { execFileSync } from "node:child_process";
import {
  REQUIRED_D1_COLUMN_CONSTRAINTS,
  REQUIRED_D1_FOREIGN_KEYS,
  REQUIRED_D1_INDEXES,
  REQUIRED_D1_SCHEMA,
  diffD1Schema,
  formatSchemaDrift,
  mapColumnConstraintPragmaResults,
  mapForeignKeyPragmaResults,
  mapIndexPragmaResults,
  mapPragmaResults,
} from "./check-production-d1-schema-lib.mjs";

function readArg(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
    ? process.argv[index + 1]
    : "";
}

const databaseName =
  readArg("--database") ?? process.env.D1_DATABASE_NAME ?? "serp-checklists-db";
const environmentLabel = readArg("--label") ?? process.env.D1_ENVIRONMENT ?? "production";
const usePreviewDatabase = process.argv.includes("--preview");
const npxCommand = process.platform === "win32" ? "cmd.exe" : "npx";
const npxArgsPrefix = process.platform === "win32" ? ["/d", "/s", "/c", "npx"] : [];
const tableNames = Object.keys(REQUIRED_D1_SCHEMA);
const pragmaCommand = tableNames
  .map((tableName) => `pragma table_info('${tableName}');`)
  .join(" ");
const indexPragmaCommand = tableNames
  .map((tableName) => `pragma index_list('${tableName}');`)
  .join(" ");
const foreignKeyPragmaCommand = tableNames
  .map((tableName) => `pragma foreign_key_list('${tableName}');`)
  .join(" ");

function runWranglerPragmas() {
  const stdout = execFileSync(
    npxCommand,
    [
      ...npxArgsPrefix,
      "wrangler",
      "d1",
      "execute",
      databaseName,
      "--remote",
      ...(usePreviewDatabase ? ["--preview"] : []),
      "--json",
      "--command",
      `${pragmaCommand} ${indexPragmaCommand} ${foreignKeyPragmaCommand}`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 10,
    },
  );

  return JSON.parse(stdout);
}

try {
  const wranglerResults = runWranglerPragmas();
  const tablePragmaResults = wranglerResults.slice(0, tableNames.length);
  const indexPragmaResults = wranglerResults.slice(tableNames.length, tableNames.length * 2);
  const foreignKeyPragmaResults = wranglerResults.slice(tableNames.length * 2);
  const actualSchemaByTable = mapPragmaResults(tableNames, tablePragmaResults);
  const actualColumnConstraintsByTable = mapColumnConstraintPragmaResults(tableNames, tablePragmaResults);
  const actualIndexesByTable = mapIndexPragmaResults(tableNames, indexPragmaResults);
  const actualForeignKeysByTable = mapForeignKeyPragmaResults(tableNames, foreignKeyPragmaResults);
  const diff = diffD1Schema(
    REQUIRED_D1_SCHEMA,
    actualSchemaByTable,
    REQUIRED_D1_INDEXES,
    actualIndexesByTable,
    REQUIRED_D1_COLUMN_CONSTRAINTS,
    actualColumnConstraintsByTable,
    REQUIRED_D1_FOREIGN_KEYS,
    actualForeignKeysByTable,
  );
  const hasDrift =
    diff.missingTables.length > 0 ||
    Object.keys(diff.missingColumns).length > 0 ||
    Object.keys(diff.missingIndexes).length > 0 ||
    Object.keys(diff.invalidIndexes).length > 0 ||
    Object.keys(diff.invalidColumns).length > 0 ||
    Object.keys(diff.missingForeignKeys).length > 0 ||
    Object.keys(diff.invalidForeignKeys).length > 0;

  if (hasDrift) {
    console.error(formatSchemaDrift(diff, `${environmentLabel}:${databaseName}`));
    process.exit(1);
  }

  console.log(`${environmentLabel} d1 schema ok (${databaseName})`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to verify ${environmentLabel} D1 schema for ${databaseName}.`);
  console.error(message);
  process.exit(1);
}
