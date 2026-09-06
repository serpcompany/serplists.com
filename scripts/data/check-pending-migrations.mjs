import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import {
  buildPendingMigrationReport,
  parsePendingMigrationNames,
  renderPendingMigrationSummary,
} from "./pending-migrations-lib.mjs";
import { buildFailureReport, writeDataCheckReports } from "./reporting.mjs";
import { resolveRemoteD1Identity } from "./wrangler-identity-lib.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";
import { safeCanaryFailure, wrapCanarySubprocessFailure } from "./canary-diagnostics.mjs";
import { resolveDirectCheckIdentity, validateDirectCheckObservation } from './environment-identity-lib.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const childEnv = sanitizedGitEnvironment();

function readArg(name) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const database = readArg("--database") ?? "unknown";
const environment = readArg("--label") ?? "unknown";
const binding = readArg('--binding') ?? 'DB';
const local = process.argv.includes("--local");
const remote = process.argv.includes("--remote");
const preview = process.argv.includes("--preview");
const persistTo = readArg("--persist-to");
const reportDirectory = readArg("--report-dir") ?? process.env.DATA_REPORT_DIR ?? "tmp/data-reports";
const migrationFiles = (() => {
  try {
    return readdirSync(new URL("../../db/migrations/", import.meta.url))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
      .sort();
  } catch { return []; }
})();
const commit = (() => {
  try { return runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim(); } catch { return "unknown"; }
})();
let resolvedIdentity = null;
let stage = "pending-migrations-configuration";

try {
  const valueOptions = ['--database', '--label', '--binding', '--database-id', '--report-dir', '--persist-to'];
  const missingValue = process.argv.some((argument, index) => valueOptions.some(option =>
    argument === `${option}=` || (argument === option && (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')))));
  if (missingValue || database === "unknown" || environment === "unknown" || local === remote) {
    throw new Error("Usage: check-pending-migrations --database NAME --label ENV (--local | --remote) [--preview] [--persist-to PATH]");
  }
  const assertedDatabaseId = readArg("--database-id") ?? process.env.D1_DATABASE_ID;
  const expectedIdentity = resolveDirectCheckIdentity({ repoRoot, environment, binding, databaseName: database, databaseId: assertedDatabaseId, local, remote, preview, persistTo });
  if (environment === "production" && remote && !assertedDatabaseId) throw new Error("Production migration verification requires the exact allowlisted database UUID.");
  const d1Arguments = ["d1", "migrations", "list", database, local ? "--local" : "--remote"];
  // Preview uses the exact inventory staging name, without Wrangler redirection.
  if (persistTo) d1Arguments.push("--persist-to", persistTo);
  stage = "pending-migrations-identity";
  resolvedIdentity = local
    ? { databaseId: expectedIdentity.databaseId, databaseName: expectedIdentity.databaseName }
    : validateDirectCheckObservation({ expected: expectedIdentity, observed: resolveRemoteD1Identity(database, { repoRoot, env: childEnv }) });
  const assertAdjacentIdentity = () => {
    if (local) return;
    const adjacent = validateDirectCheckObservation({ expected: expectedIdentity, observed: resolveRemoteD1Identity(database, { repoRoot, env: childEnv }) });
    if (adjacent.databaseId !== resolvedIdentity.databaseId || adjacent.databaseName !== resolvedIdentity.databaseName) throw new Error("D1 identity changed during migration-list verification.");
  };
  const runWrangler = (args) => {
    try {
      return execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", ...args], { cwd: repoRoot, encoding: "utf8", env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      throw wrapCanarySubprocessFailure(stage, error);
    }
  };
  let output;
  let identityChecks = [];
  if (environment === "production" && remote) {
    stage = "pending-migrations-command";
    const bound = runProductionIdentityBoundCommand({ environment, database: { databaseName: database, databaseId: assertedDatabaseId }, operation: "pending-migration-list", commandArgs: d1Arguments, runWrangler });
    output = bound.output;
    identityChecks = [bound.observedIdentity];
  } else {
    assertAdjacentIdentity();
    stage = "pending-migrations-command";
    output = runWrangler(d1Arguments);
    assertAdjacentIdentity();
  }
  if (assertedDatabaseId && assertedDatabaseId !== resolvedIdentity.databaseId) {
    throw new Error(`Resolved database ID ${resolvedIdentity.databaseId} does not match asserted ID ${assertedDatabaseId}.`);
  }
  const databaseId = resolvedIdentity.databaseId;
  if (resolvedIdentity.databaseName !== database) {
    throw new Error(`Resolved database name ${resolvedIdentity.databaseName} does not match ${database}.`);
  }
  stage = "pending-migrations-result";
  const report = buildPendingMigrationReport({
    commit,
    database,
    databaseId,
    environment,
    migrationFiles,
    mode: local ? "local" : preview ? "preview" : "remote",
    pendingMigrations: parsePendingMigrationNames(output, migrationFiles),
  });
  report.identityChecks = identityChecks;
  Object.assign(report.target, { binding, databaseName: resolvedIdentity.databaseName });
  const summary = `${renderPendingMigrationSummary(report)}\nBinding: ${binding}.`;
  const paths = writeDataCheckReports({ name: `pending-migrations-${environment}`, report, summary, reportDirectory });
  console.log(summary);
  console.log(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
  if (report.verdict === "fail") process.exitCode = 1;
} catch (error) {
  const failure = safeCanaryFailure(stage, error);
  const safeEnvironment = ['local', 'staging', 'rehearsal', 'production'].includes(environment) ? environment : 'unknown';
  const safeDatabase = resolvedIdentity?.databaseName ?? 'unknown';
  const report = buildFailureReport({
    check: "pending-migrations",
    commit,
    error: new Error(failure.message),
    migrationFiles,
    requestedTarget: { environment: safeEnvironment, binding: binding === 'DB' ? 'DB' : 'unknown', databaseName: safeDatabase, mode: local ? "local" : preview ? "preview" : "remote" },
    resolvedIdentity,
  });
  report.failedStage = failure.stage;
  report.errorCode = failure.code;
  report.checks = [{ name: failure.check, verdict: "fail" }];
  if (failure.exitStatus !== undefined) report.exitStatus = failure.exitStatus;
  const summary = `BLOCKED ${safeEnvironment}:${safeDatabase} at ${failure.stage}: ${failure.code}. ${failure.message}`;
  let paths;
  try { paths = writeDataCheckReports({ name: `pending-migrations-${safeEnvironment}`, report, summary, reportDirectory }); }
  catch { console.error('Pending migration failure report could not be persisted.'); }
  console.error(summary);
  if (paths) console.error(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
  process.exitCode = 1;
}
