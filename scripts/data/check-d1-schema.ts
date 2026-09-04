import { execFileSync } from "node:child_process";
import * as drizzleSchema from "../../db/schema/index";
import {
  buildCatalogContract,
  buildDrizzleContract,
  catalogFromPragmaResults,
  diffDrizzleContract,
  diffRuntimeSchema,
  inspectDatabase,
  listMigrationFiles,
  replayMigrations,
} from "./schema-contract";
import { buildFailureReport, writeDataCheckReports } from "./reporting.mjs";
import { resolveRemoteD1Identity } from "./wrangler-identity-lib.mjs";

function readArg(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const database = readArg("--database") ?? "unknown";
const environment = readArg("--label") ?? "unknown";
const preview = process.argv.includes("--preview");
const reportDirectory = readArg("--report-dir") ?? "tmp/data-reports";
const migrations = (() => {
  try { return listMigrationFiles().map((migration) => migration.name); } catch { return []; }
})();
const commit = (() => {
  try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "unknown"; }
})();
let resolvedIdentity: { databaseId: string; databaseName: string } | null = null;

try {
  if (database === "unknown" || environment === "unknown") {
    throw new Error("Usage: check-d1-schema --database NAME --label ENV [--preview] [--database-id ID]");
  }
  const runtimeContract = buildDrizzleContract(drizzleSchema);
  const migrated = replayMigrations();
  const migrationContract = buildCatalogContract(inspectDatabase(migrated));
  migrated.close();
  const tableNames = [...new Set([
    ...Object.keys(runtimeContract.tables),
    ...Object.keys(migrationContract.tables),
  ])].sort();
  const sql = [
    ...tableNames.map((name) => `PRAGMA table_info('${name.replaceAll("'", "''")}');`),
    ...tableNames.map((name) => `PRAGMA index_list('${name.replaceAll("'", "''")}');`),
    ...tableNames.map((name) => `SELECT il.name AS index_name, ii.seqno, ii.name AS column_name, sm.sql AS index_sql FROM pragma_index_list('${name.replaceAll("'", "''")}') AS il JOIN pragma_index_info(il.name) AS ii LEFT JOIN sqlite_schema AS sm ON sm.type = 'index' AND sm.name = il.name ORDER BY il.name, ii.seqno;`),
  ].join(" ");
  resolvedIdentity = resolveRemoteD1Identity(database);
  const args = ["exec", "wrangler", "d1", "execute", database, "--remote"];
  if (preview) args.push("--preview");
  args.push("--json", "--command", sql);
  const output = execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
  const results = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  const remoteCatalog = catalogFromPragmaResults(tableNames, results);
  const runtimeDiff = diffRuntimeSchema(drizzleSchema, remoteCatalog);
  const migrationDiff = diffDrizzleContract(migrationContract, remoteCatalog);
  const verdict = runtimeDiff.verdict === "pass" && migrationDiff.verdict === "pass" ? "pass" : "fail";
  const assertedDatabaseId = readArg("--database-id") ?? process.env.D1_DATABASE_ID;
  if (assertedDatabaseId && assertedDatabaseId !== resolvedIdentity.databaseId) {
    throw new Error(`Resolved database ID ${resolvedIdentity.databaseId} does not match asserted ID ${assertedDatabaseId}.`);
  }
  const databaseId = resolvedIdentity.databaseId;
  const report = {
    check: "d1-schema-contract",
    commit,
    target: { environment, database, databaseId, mode: preview ? "preview" : "remote" },
    migrationRange: { from: migrations[0] ?? null, to: migrations.at(-1) ?? null },
    schemaDifferences: { runtime: runtimeDiff, migration: migrationDiff },
    verdict,
  };
  const summary = verdict === "pass"
    ? `PASS ${environment}:${database} (${databaseId}) matches the Drizzle runtime and replayed migration contracts at ${commit}.`
    : [
        `BLOCKED ${environment}:${database} (${databaseId}) has Drizzle/D1 schema drift at ${commit}.`,
        JSON.stringify(report.schemaDifferences),
        "Apply the required reviewed Wrangler migrations before deploying compatible application code.",
      ].join("\n");
  const paths = writeDataCheckReports({ name: `d1-schema-${environment}`, report, summary, reportDirectory });
  console.log(summary);
  console.log(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
  if (verdict === "fail") process.exitCode = 1;
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
  const reportError = new Error(stderr || (error instanceof Error ? error.message : String(error)));
  const report = buildFailureReport({
    check: "d1-schema-contract",
    commit,
    error: reportError,
    migrationFiles: migrations,
    requestedTarget: { environment, database, mode: preview ? "preview" : "remote" },
    resolvedIdentity,
  });
  const summary = `BLOCKED ${environment}:${database}: ${report.error}`;
  const paths = writeDataCheckReports({ name: `d1-schema-${environment}`, report, summary, reportDirectory });
  console.error(summary);
  console.error(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
  process.exitCode = 1;
}
