#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseAppliedMigrationLedger } from "./invariant-capture-lib.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { resolveRemoteD1Identity } from "./wrangler-identity-lib.mjs";
import { safeCanaryFailure } from "./canary-diagnostics.mjs";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportDirectory = "tmp/data-reports/staging";
const base = process.env.STAGING_BASE_SHA;
const head = process.env.GITHUB_SHA;
let stage = 'staging-range-configuration';
let migrationRange = { from: null, to: null };
const target = { environment: 'staging', binding: 'DB', databaseName: 'serp-checklists-staging-db', databaseId: 'fcaf4325-5be7-4ead-ab60-45932a04177b' };
try {
  if (!/^[0-9a-f]{40}$/.test(base ?? "") || /^0{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head ?? "") || /^0{40}$/.test(head)) {
    throw new Error("Staging reviewed range requires exact nonzero GitHub push before/head SHAs.");
  }
  const gitEnvironment = sanitizedGitEnvironment();
  runRepositoryGit({ repoRoot, args: ["merge-base", "--is-ancestor", base, head], stdio: "ignore" });
  stage = 'staging-range-provenance';
  // The child writes raw failure details into its own artifacts. Publish those
  // artifacts only after success, and remove private failed artifacts locally.
  const privateProvenanceDirectory = mkdtempSync(path.join(tmpdir(), 'staging-provenance-'));
  try {
    execFileSync(pnpm, [
    "run",
    "check:data:migration-provenance",
    "--",
    "--base",
    base,
    "--report-dir",
    privateProvenanceDirectory,
  ], { cwd: repoRoot, env: gitEnvironment, stdio: ['ignore', 'pipe', 'pipe'] });
    const provenanceDirectory = process.env.DATA_REPORT_DIR ?? 'tmp/data-reports/staging-reviewed-range';
    mkdirSync(provenanceDirectory, { recursive: true });
    for (const suffix of ['json', 'junit.xml', 'md', 'txt']) {
      const filename = `migration-provenance.${suffix}`;
      copyFileSync(path.join(privateProvenanceDirectory, filename), path.join(provenanceDirectory, filename));
    }
  } finally { rmSync(privateProvenanceDirectory, { recursive: true, force: true }); }
  const expectedIdentity = { databaseName: "serp-checklists-staging-db", databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b" };
  const assertIdentity = () => {
    stage = 'staging-range-identity';
    const identity = resolveRemoteD1Identity(expectedIdentity.databaseName, { repoRoot, env: gitEnvironment });
    if (identity.databaseName !== expectedIdentity.databaseName || identity.databaseId !== expectedIdentity.databaseId) throw new Error("Staging database identity changed during reviewed-range verification.");
  };
  assertIdentity();
  stage = 'staging-range-pending';
  const output = execFileSync(pnpm, ["exec", "wrangler", "d1", "migrations", "list", "DB", "--remote", "--preview"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: gitEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assertIdentity();
  stage = 'staging-range-pending';
  const files = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const pending = parsePendingMigrationNames(output, files);
  migrationRange = { from: pending[0] ?? null, to: pending.at(-1) ?? null };
  stage = 'staging-range-plan';
  // Isolate the existing plan resolver's nested Git subprocess diagnostics too.
  // Only its successful structured result crosses this process boundary.
  const plan = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e',
    'import { resolvePendingRehearsalPlan } from "./scripts/data/rehearsal-plan-lib.mjs"; console.log(JSON.stringify(resolvePendingRehearsalPlan(JSON.parse(process.argv[1]))));',
    JSON.stringify({ repoRoot, commit: head, baseRef: base, pending }),
  ], { cwd: repoRoot, env: gitEnvironment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  stage = 'staging-range-ledger';
  const applied = parseAppliedMigrationLedger(execFileSync(pnpm, ["exec", "wrangler", "d1", "execute", expectedIdentity.databaseName, "--remote", "--json", "--command", "SELECT id, name FROM d1_migrations ORDER BY id;"], { cwd: repoRoot, env: gitEnvironment, encoding: "utf8", stdio: ['ignore', 'pipe', 'pipe'] }));
  assertIdentity();
  stage = 'staging-range-ledger';
  if (JSON.stringify([...applied, ...pending]) !== JSON.stringify(files)) throw new Error("Live staging ledger plus reviewed pending range must exactly equal repository history.");
  const report = {
    check: "staging-reviewed-range",
    verdict: "pass",
    commit: head,
    baseCommit: base,
    target: { environment: "staging", databaseName: "serp-checklists-staging-db", databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b" },
    migrationRange: { from: pending[0] ?? null, to: pending.at(-1) ?? null },
    pendingMigrations: pending,
    ledger: { before: applied },
    coverage: { planId: plan.id, declarationSha256: plan.declarationSha256, artifactSha256: plan.artifactSha256, affectedTables: plan.affectedTables, invariants: plan.invariants },
  };
  const summary = `PASS exact staging commit/range: ${pending.join(", ") || "no migration"}.`;
  stage = 'staging-range-reporting';
  writeDataCheckReports({ name: "staging-reviewed-range", report, summary, reportDirectory });
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `MIGRATION_FROM=${pending[0] ?? "none"}\nMIGRATION_TO=${pending.at(-1) ?? "none"}\n`);
  console.log(summary);
} catch (error) {
  const failure = safeCanaryFailure(stage, error);
  const safeCommit = value => /^[0-9a-f]{40}$/.test(value ?? '') ? value : 'unknown';
  const context = `Commit: ${safeCommit(head)}; base: ${safeCommit(base)}; target: staging DB ${target.databaseName} (${target.databaseId}); range: ${migrationRange.from ?? 'none'} -> ${migrationRange.to ?? 'none'}.`;
  const summary = `BLOCKED staging reviewed range: ${failure.message} Stage: ${failure.stage}; code: ${failure.code}; status: ${failure.exitStatus ?? 'unavailable'}.\n${context}`;
  try { writeDataCheckReports({
    name: "staging-reviewed-range",
    report: { check: "staging-reviewed-range", verdict: "fail", commit: safeCommit(head), baseCommit: safeCommit(base), target, migrationRange, failedStage: failure.stage, error: failure.message, code: failure.code, ...(failure.exitStatus !== undefined ? { exitStatus: failure.exitStatus } : {}) },
    summary,
    reportDirectory,
  }); } catch {
    console.error(safeCanaryFailure('staging-range-reporting').message);
  }
  console.error(summary);
  process.exit(1);
}
