#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { appendFileSync, readdirSync } from "node:fs";
import { resolvePendingRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { parseAppliedMigrationLedger } from "./invariant-capture-lib.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { resolveRemoteD1Identity } from "./wrangler-identity-lib.mjs";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const reportDirectory = "tmp/data-reports/staging";
const base = process.env.STAGING_BASE_SHA;
const head = process.env.GITHUB_SHA;
try {
  if (!/^[0-9a-f]{40}$/.test(base ?? "") || /^0{40}$/.test(base) || !/^[0-9a-f]{40}$/.test(head ?? "")) {
    throw new Error("Staging reviewed range requires exact nonzero GitHub push before/head SHAs.");
  }
  const gitEnvironment = sanitizedGitEnvironment();
  runRepositoryGit({ repoRoot, args: ["merge-base", "--is-ancestor", base, head], stdio: "ignore" });
  execFileSync(pnpm, [
    "run",
    "check:data:migration-provenance",
    "--",
    "--base",
    base,
    "--report-dir",
    process.env.DATA_REPORT_DIR ?? "tmp/data-reports/staging-reviewed-range",
  ], { cwd: repoRoot, env: gitEnvironment, stdio: "inherit" });
  const expectedIdentity = { databaseName: "serp-checklists-staging-db", databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b" };
  const assertIdentity = () => {
    const identity = resolveRemoteD1Identity(expectedIdentity.databaseName, { repoRoot, env: gitEnvironment });
    if (identity.databaseName !== expectedIdentity.databaseName || identity.databaseId !== expectedIdentity.databaseId) throw new Error("Staging database identity changed during reviewed-range verification.");
  };
  assertIdentity();
  const output = execFileSync(pnpm, ["exec", "wrangler", "d1", "migrations", "list", "DB", "--remote", "--preview"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: gitEnvironment,
  });
  assertIdentity();
  const files = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const pending = parsePendingMigrationNames(output, files);
  const plan = resolvePendingRehearsalPlan({ repoRoot, commit: head, baseRef: base, pending });
  const applied = parseAppliedMigrationLedger(execFileSync(pnpm, ["exec", "wrangler", "d1", "execute", expectedIdentity.databaseName, "--remote", "--json", "--command", "SELECT id, name FROM d1_migrations ORDER BY id;"], { cwd: repoRoot, env: gitEnvironment, encoding: "utf8" }));
  assertIdentity();
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
  writeDataCheckReports({ name: "staging-reviewed-range", report, summary, reportDirectory });
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `MIGRATION_FROM=${pending[0] ?? "none"}\nMIGRATION_TO=${pending.at(-1) ?? "none"}\n`);
  console.log(summary);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeDataCheckReports({
    name: "staging-reviewed-range",
    report: { check: "staging-reviewed-range", verdict: "fail", commit: head ?? "unknown", baseCommit: base ?? "unknown", target: { environment: "staging", databaseName: "serp-checklists-staging-db", databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b" }, migrationRange: { from: null, to: null }, error: message },
    summary: `BLOCKED staging reviewed range: ${message}`,
    reportDirectory,
  });
  console.error(message);
  process.exit(1);
}
