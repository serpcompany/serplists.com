import {
  REQUIRED_D1_COLUMN_CONSTRAINTS,
  REQUIRED_D1_FOREIGN_KEYS,
  REQUIRED_D1_INDEXES,
  REQUIRED_D1_SCHEMA,
  REQUIRED_D1_TRIGGERS,
  buildSchemaQuery,
  diffD1Schema,
  diffD1Triggers,
  formatSchemaDrift,
  hasSchemaDrift,
  mapColumnConstraintPragmaResults,
  mapForeignKeyPragmaResults,
  mapIndexPragmaResults,
  mapPragmaResults,
  mapTriggerResults,
  splitSchemaQueryResults,
} from "./check-production-d1-schema-lib";
import { flagValueAt } from "./lib/cli-flags";
import { execTool } from "./lib/run-tool";
import { parseWranglerResultSets } from "./lib/wrangler-json";

function readArg(name: string): string | null {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  return flagValueAt(process.argv, process.argv.indexOf(name));
}

const databaseName =
  readArg("--database") ?? process.env["D1_DATABASE_NAME"] ?? "serp-checklists-db";
const environmentLabel = readArg("--label") ?? process.env["D1_ENVIRONMENT"] ?? "production";
const usePreviewDatabase = process.argv.includes("--preview");
const tableNames = Object.keys(REQUIRED_D1_SCHEMA);

function runWranglerSchemaQuery() {
  const stdout = execTool(
    "wrangler",
    [
      "d1",
      "execute",
      databaseName,
      "--remote",
      ...(usePreviewDatabase ? ["--preview"] : []),
      "--json",
      "--command",
      buildSchemaQuery(tableNames),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 1024 * 1024 * 10,
    },
  );

  return parseWranglerResultSets(stdout);
}

try {
  const { tableResults, indexResults, foreignKeyResults, triggerResult } = splitSchemaQueryResults(
    tableNames,
    runWranglerSchemaQuery(),
  );
  const actualSchemaByTable = mapPragmaResults(tableNames, tableResults);
  const actualColumnConstraintsByTable = mapColumnConstraintPragmaResults(tableNames, tableResults);
  const actualIndexesByTable = mapIndexPragmaResults(tableNames, indexResults);
  const actualForeignKeysByTable = mapForeignKeyPragmaResults(tableNames, foreignKeyResults);
  const schemaDiff = diffD1Schema(
    REQUIRED_D1_SCHEMA,
    actualSchemaByTable,
    REQUIRED_D1_INDEXES,
    actualIndexesByTable,
    REQUIRED_D1_COLUMN_CONSTRAINTS,
    actualColumnConstraintsByTable,
    REQUIRED_D1_FOREIGN_KEYS,
    actualForeignKeysByTable,
  );
  const diff = { ...schemaDiff, ...diffD1Triggers(REQUIRED_D1_TRIGGERS, mapTriggerResults(triggerResult)) };

  if (hasSchemaDrift(diff)) {
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
