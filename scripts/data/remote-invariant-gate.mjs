#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { captureRemoteInvariantSnapshot, compareProductionInvariants } from "./invariant-capture-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import { evaluateInvariantLedgerTransition, validatePreInvariantEvidence, validateRemoteInvariantContext } from "./remote-invariant-evidence-lib.mjs";

function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
const mode = process.argv[2];
const database = arg("--database");
const state = arg("--state");
const reportDirectory = arg("--report-dir") ?? "tmp/data-reports/remote-invariants";
const context = {
  commit: arg("--commit"),
  target: { environment: arg("--environment"), binding: arg("--binding"), databaseName: database, databaseId: arg("--database-id") },
  expectedMigrationRange: { from: arg("--migration-from"), to: arg("--migration-to") },
  comparisonKind: arg("--comparison-kind") ?? "migration",
};
const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
function wrangler(args) { return execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", ...args], { encoding: "utf8", env: childEnv }); }
function verifyLiveIdentity(target) {
  const live = extractD1Identity(wrangler(["d1", "info", target.databaseName, "--json"]));
  if (live.databaseId !== target.databaseId || live.databaseName !== target.databaseName) throw new Error(`Live invariant target mismatch for ${target.environment}.`);
}
function capture(target) {
  verifyLiveIdentity(target);
  return captureRemoteInvariantSnapshot({ database: target.databaseName, key: process.env.INVARIANT_HMAC_KEY, runWrangler: wrangler });
}
try {
  validateRemoteInvariantContext(context);
  if (!state || !["capture", "compare"].includes(mode)) throw new Error("Remote invariant gate arguments are incomplete.");
  if (mode === "capture") {
    const snapshot = capture(context.target);
    const evidence = { schemaVersion: 1, check: "remote-invariant-capture", verdict: "pass", ...context, snapshot };
    mkdirSync(path.dirname(state), { recursive: true });
    writeFileSync(state, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
    writeDataCheckReports({ name: "remote-invariant-capture", report: { ...evidence, migrationRange: context.expectedMigrationRange, ledger: { applied: snapshot.appliedMigrations, appliedThrough: snapshot.appliedThrough, sha256: snapshot.ledgerSha256 } }, summary: `PASS remote invariant capture commit=${context.commit} environment=${context.target.environment} binding=${context.target.binding} database=${context.target.databaseName} databaseId=${context.target.databaseId} ledger=${snapshot.appliedThrough}.`, reportDirectory });
  } else {
    const pre = JSON.parse(readFileSync(state, "utf8"));
    validatePreInvariantEvidence({ pre, context });
    const post = capture(context.target);
    const comparison = compareProductionInvariants({ pre: pre.snapshot.invariants, post: post.invariants, preHasEvolution: pre.snapshot.hasEvolution, postHasEvolution: post.hasEvolution, preDomain: pre.snapshot.domain, postDomain: post.domain });
    const transition = evaluateInvariantLedgerTransition({ before: pre.snapshot.appliedMigrations, after: post.appliedMigrations, comparisonKind: context.comparisonKind, expectedRange: context.expectedMigrationRange });
    const { added, removed, observedRange } = transition;
    const ledgerMatches = transition.verdict === "pass";
    const report = { ...comparison, check: "remote-invariant-comparison", commit: context.commit, target: context.target, sourceTarget: pre.target, comparisonKind: context.comparisonKind, migrationRange: observedRange, ledger: { before: pre.snapshot.appliedMigrations, after: post.appliedMigrations, beforeSha256: pre.snapshot.ledgerSha256, afterSha256: post.ledgerSha256, added, removed, appliedThrough: post.appliedThrough, verdict: ledgerMatches ? "pass" : "fail" } };
    if (!ledgerMatches) { report.verdict = "fail"; report.failures = [...report.failures, "migration ledger or reviewed range mismatch"]; }
    const summary = `${report.verdict.toUpperCase()} remote invariant comparison commit=${context.commit} environment=${context.target.environment} binding=${context.target.binding} database=${context.target.databaseName} databaseId=${context.target.databaseId} migration=${observedRange.from}->${observedRange.to} ledger=${post.appliedThrough}.`;
    writeDataCheckReports({ name: "remote-invariant-comparison", report, summary, reportDirectory });
    if (report.verdict !== "pass") process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const report = { check: mode === "capture" ? "remote-invariant-capture" : "remote-invariant-comparison", verdict: "fail", commit: context.commit ?? "unknown", target: context.target, migrationRange: context.expectedMigrationRange, comparisonKind: context.comparisonKind, error: message };
  writeDataCheckReports({ name: report.check, report, summary: `BLOCKED remote invariants commit=${report.commit} environment=${context.target.environment ?? "unknown"} binding=${context.target.binding ?? "unknown"} database=${database ?? "unknown"} databaseId=${context.target.databaseId ?? "unknown"} migration=${context.expectedMigrationRange.from ?? "unknown"}->${context.expectedMigrationRange.to ?? "unknown"}: ${message}`, reportDirectory });
  console.error(message); process.exitCode = 1;
}
