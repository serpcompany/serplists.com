import { execFileSync } from "node:child_process";
import * as drizzleSchema from "../../db/schema/index";
import {
  buildCatalogContract,
  buildDrizzleContract,
  catalogFromPragmaResults,
  compareDatabaseSchemas,
  diffDrizzleContract,
  diffRuntimeSchema,
  inspectDatabase,
  listMigrationFiles,
  parseRemoteTableInventory,
  replayMigrations,
  tableInfoSql,
} from "./schema-contract";
import { buildFailureReport, writeDataCheckReports } from "./reporting.mjs";
import { resolveRemoteD1Identity } from "./wrangler-identity-lib.mjs";
import { compareMigrationLedger, parseAppliedMigrationLedger } from "./invariant-capture-lib.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";
import { safeCanaryFailure, wrapCanarySubprocessFailure } from './canary-diagnostics.mjs';
import { privacySafeLedgerProjection } from './ledger-reporting-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const childEnv = sanitizedGitEnvironment();

function readArg(name: string) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function differenceCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.entries(value).reduce((count, [key, item]) => count + (key === 'verdict' ? 0 : differenceCount(item)), 0);
  return value == null ? 0 : 1;
}

const database = readArg("--database") ?? "unknown";
const environment = readArg("--label") ?? "unknown";
const binding = readArg("--binding") ?? "DB";
const preview = process.argv.includes("--preview");
const reportDirectory = readArg("--report-dir") ?? process.env.DATA_REPORT_DIR ?? "tmp/data-reports";
const migrations = (() => {
  try { return listMigrationFiles().map((migration) => migration.name); } catch { return []; }
})();
const commit = (() => {
  try { return runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim(); } catch { return "unknown"; }
})();
let resolvedIdentity: { databaseId: string; databaseName: string } | null = null;
const identityChecks: unknown[] = [];
let stage = 'schema-configuration';

try {
  if (database === "unknown" || environment === "unknown") {
    throw new Error("Usage: check-d1-schema --database NAME --label ENV [--binding BINDING] [--preview] [--database-id ID]");
  }
  const runtimeContract = buildDrizzleContract(drizzleSchema);
  const migrated = replayMigrations();
  const expectedMigrationCatalog = inspectDatabase(migrated);
  const migrationContract = buildCatalogContract(expectedMigrationCatalog);
  migrated.close();
  const expectedTableNames = [...new Set([...Object.keys(runtimeContract.tables), ...Object.keys(migrationContract.tables)])];
  const assertedDatabaseId = readArg("--database-id") ?? process.env.D1_DATABASE_ID;
  if (environment === "production" && !assertedDatabaseId) throw new Error("Production schema verification requires the exact asserted database UUID.");
  stage = 'schema-identity';
  resolvedIdentity = resolveRemoteD1Identity(database, { repoRoot, env: childEnv });
  if (assertedDatabaseId && assertedDatabaseId !== resolvedIdentity.databaseId) throw new Error(`Resolved database ID ${resolvedIdentity.databaseId} does not match asserted ID ${assertedDatabaseId}.`);
  const assertAdjacentIdentity = () => {
    stage = 'schema-identity';
    const adjacent = resolveRemoteD1Identity(database, { repoRoot, env: childEnv });
    if (adjacent.databaseId !== resolvedIdentity?.databaseId || adjacent.databaseName !== resolvedIdentity?.databaseName) throw new Error("D1 identity changed during schema verification.");
  };
  const targetArgs = ["d1", "execute", database, "--remote"];
  if (preview) targetArgs.push("--preview");
  const runWrangler = (args: string[]) => {
    stage = args[1] === 'info' ? 'schema-identity' : 'schema-query';
    try { return execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", ...args], { cwd: repoRoot, encoding: "utf8", env: childEnv, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 10 * 1024 * 1024 }); }
    catch (error) { throw wrapCanarySubprocessFailure(stage, error); }
  };
  const executeRemote = (operation: string, args: string[]) => {
    if (environment === "production") {
      const result = runProductionIdentityBoundCommand({ environment, database: { databaseName: database, databaseId: assertedDatabaseId }, operation, commandArgs: args, runWrangler });
      identityChecks.push(result.observedIdentity);
      stage = 'schema-query';
      return result.output;
    }
    assertAdjacentIdentity();
    const output = runWrangler(args);
    assertAdjacentIdentity();
    stage = 'schema-query';
    return output;
  };
  const inventoryOutput = executeRemote("schema-table-inventory", [...targetArgs, "--json", "--command", "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='d1_migrations' AND name!='_cf_METADATA' ORDER BY name"]);
  const tableNames = [...new Set([...expectedTableNames, ...parseRemoteTableInventory(inventoryOutput)])].sort();
  const sql = [
    ...tableNames.map((name) => `${tableInfoSql(name)};`),
    ...tableNames.map((name) => `PRAGMA index_list('${name.replaceAll("'", "''")}');`),
    ...tableNames.map((name) => `SELECT il.name AS index_name, ii.seqno, ii.name AS column_name, sm.sql AS index_sql FROM pragma_index_list('${name.replaceAll("'", "''")}') AS il JOIN pragma_index_info(il.name) AS ii LEFT JOIN sqlite_schema AS sm ON sm.type = 'index' AND sm.name = il.name ORDER BY il.name, ii.seqno;`),
    ...tableNames.map((name) => `PRAGMA foreign_key_list('${name.replaceAll("'", "''")}');`),
    "SELECT type AS object_type, name, tbl_name AS table_name, sql FROM sqlite_schema WHERE type IN ('table','trigger','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name;",
  ].join(" ");
  const args = [...targetArgs];
  args.push("--json", "--command", sql);
  const output = executeRemote("schema-catalog", args);
  const results = JSON.parse(output) as Array<{ results?: Array<Record<string, unknown>> }>;
  const remoteCatalog = catalogFromPragmaResults(tableNames, results);
  const ledgerOutput = executeRemote("schema-ledger", [...targetArgs, "--json", "--command", "SELECT id, name FROM d1_migrations ORDER BY id"]);
  const appliedMigrations = parseAppliedMigrationLedger(ledgerOutput);
  stage = 'schema-comparison';
  const ledger = compareMigrationLedger({ repositoryMigrations: migrations, appliedMigrations });
  const ledgerProjection = privacySafeLedgerProjection({ repositoryMigrations: migrations, observedMigrations: appliedMigrations });
  const reportLedger = {
    expected: ledger.expected,
    missing: ledger.missing,
    orderMatches: ledger.orderMatches,
    verdict: ledger.verdict,
    ...ledgerProjection,
  };
  const runtimeDiff = diffRuntimeSchema(drizzleSchema, remoteCatalog);
  const migrationDiff = diffDrizzleContract(migrationContract, remoteCatalog);
  const migrationObjectDiff = compareDatabaseSchemas(expectedMigrationCatalog, remoteCatalog);
  const verdict = runtimeDiff.verdict === "pass" && migrationDiff.verdict === "pass" && migrationObjectDiff.verdict === "pass" && ledger.verdict === "pass" ? "pass" : "fail";
  const databaseId = resolvedIdentity.databaseId;
  const report = {
    check: "d1-schema-contract",
    commit,
    target: { environment, binding, databaseName: resolvedIdentity.databaseName, databaseId, mode: preview ? "preview" : "remote" },
    migrationRange: { from: migrations[0] ?? null, to: migrations.at(-1) ?? null },
    // Remote differences may contain SQL defaults or tenant-named objects.
    // Retain only counts on failure, never those provider-controlled values.
    schemaDifferences: verdict === 'pass'
      ? { runtime: runtimeDiff, migration: migrationDiff, migrationObjects: migrationObjectDiff }
      : Object.fromEntries(Object.entries({ runtime: runtimeDiff, migration: migrationDiff, migrationObjects: migrationObjectDiff }).map(([name, diff]) => [name, { verdict: diff.verdict, differenceCount: differenceCount(diff) }])),
    ledger: reportLedger,
    identityChecks,
    verdict,
  };
  const reportIdentity = `environment=${environment} binding=${binding} databaseName=${resolvedIdentity.databaseName} databaseId=${databaseId} commit=${commit} migration=${report.migrationRange.from}->${report.migrationRange.to}`;
  const summary = verdict === "pass"
    ? `PASS ${reportIdentity}; schema matches the Drizzle runtime and replayed migration contracts.`
    : [
        `BLOCKED ${reportIdentity}; Drizzle/D1 schema drift detected.`,
        JSON.stringify(report.schemaDifferences),
        `Ledger differences: ${JSON.stringify(reportLedger)}.`,
        "Apply the required reviewed Wrangler migrations before deploying compatible application code.",
      ].join("\n");
  const paths = writeDataCheckReports({ name: `d1-schema-${environment}`, report, summary, reportDirectory });
  console.log(summary);
  console.log(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
  if (verdict === "fail") process.exitCode = 1;
} catch (error) {
  const failure = safeCanaryFailure(stage, error);
  const report = buildFailureReport({
    check: "d1-schema-contract",
    commit,
    error: new Error(failure.message),
    migrationFiles: migrations,
    requestedTarget: { environment, binding, databaseName: database, mode: preview ? "preview" : "remote" },
    resolvedIdentity,
  });
  Object.assign(report, { failedStage: failure.stage, errorCode: failure.code, checks: [{ name: failure.check, verdict: 'fail' }], ...(failure.exitStatus === undefined ? {} : { exitStatus: failure.exitStatus }) });
  const summary = `BLOCKED environment=${environment} binding=${binding} databaseName=${resolvedIdentity?.databaseName ?? database} databaseId=${resolvedIdentity?.databaseId ?? 'unresolved-id'} commit=${commit} migration=${report.migrationRange.from}->${report.migrationRange.to} stage=${failure.stage}: ${failure.code}. ${report.error}`;
  try { writeDataCheckReports({ name: `d1-schema-${environment}`, report, summary, reportDirectory }); }
  catch { console.error('Remote schema failure report could not be persisted.'); }
  console.error(summary);
  process.exitCode = 1;
}
