import { execFileSync } from "node:child_process";
import {
  REQUIRED_D1_SCHEMA,
  diffD1Schema,
  formatSchemaDrift,
  mapPragmaResults,
} from "./check-production-d1-schema-lib.mjs";

const databaseName = process.env.D1_DATABASE_NAME ?? "serp-checklists-db";
const tableNames = Object.keys(REQUIRED_D1_SCHEMA);
const pragmaCommand = tableNames
  .map((tableName) => `pragma table_info('${tableName}');`)
  .join(" ");

function runWranglerPragmas() {
  const stdout = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      databaseName,
      "--remote",
      "--json",
      "--command",
      pragmaCommand,
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
  const actualSchemaByTable = mapPragmaResults(tableNames, wranglerResults);
  const diff = diffD1Schema(REQUIRED_D1_SCHEMA, actualSchemaByTable);
  const hasDrift =
    diff.missingTables.length > 0 || Object.keys(diff.missingColumns).length > 0;

  if (hasDrift) {
    console.error(formatSchemaDrift(diff, databaseName));
    process.exit(1);
  }

  console.log(`production d1 schema ok (${databaseName})`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unable to verify production D1 schema for ${databaseName}.`);
  console.error(message);
  process.exit(1);
}
