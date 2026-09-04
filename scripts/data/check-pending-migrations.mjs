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

try {
  if (database === "unknown" || environment === "unknown" || local === remote) {
    throw new Error("Usage: check-pending-migrations --database NAME --label ENV (--local | --remote) [--preview] [--persist-to PATH]");
  }
  const wranglerArguments = ["exec", "wrangler", "d1", "migrations", "list", database, local ? "--local" : "--remote"];
  if (preview) wranglerArguments.push("--preview");
  if (persistTo) wranglerArguments.push("--persist-to", persistTo);
  resolvedIdentity = local
    ? { databaseId: `local:${database}`, databaseName: database }
    : resolveRemoteD1Identity(database, { repoRoot, env: childEnv });
  const output = execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", wranglerArguments, {
    cwd: repoRoot,
    encoding: "utf8",
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const assertedDatabaseId = readArg("--database-id") ?? process.env.D1_DATABASE_ID;
  if (assertedDatabaseId && assertedDatabaseId !== resolvedIdentity.databaseId) {
    throw new Error(`Resolved database ID ${resolvedIdentity.databaseId} does not match asserted ID ${assertedDatabaseId}.`);
  }
  const databaseId = resolvedIdentity.databaseId;
  if (resolvedIdentity.databaseName !== database) {
    throw new Error(`Resolved database name ${resolvedIdentity.databaseName} does not match ${database}.`);
  }
  const report = buildPendingMigrationReport({
    commit,
    database,
    databaseId,
    environment,
    migrationFiles,
    mode: local ? "local" : preview ? "preview" : "remote",
    pendingMigrations: parsePendingMigrationNames(output),
  });
  const summary = renderPendingMigrationSummary(report);
  const paths = writeDataCheckReports({ name: `pending-migrations-${environment}`, report, summary, reportDirectory });
  console.log(summary);
  console.log(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
  if (report.verdict === "fail") process.exitCode = 1;
} catch (error) {
  const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
  const reportError = new Error(stderr || (error instanceof Error ? error.message : String(error)));
  const report = buildFailureReport({
    check: "pending-migrations",
    commit,
    error: reportError,
    migrationFiles,
    requestedTarget: { environment, database, mode: local ? "local" : preview ? "preview" : "remote" },
    resolvedIdentity,
  });
  const summary = `BLOCKED ${environment}:${database}: ${report.error}`;
  const paths = writeDataCheckReports({ name: `pending-migrations-${environment}`, report, summary, reportDirectory });
  console.error(summary);
  console.error(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
  process.exitCode = 1;
}
