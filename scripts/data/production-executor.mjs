#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertDeployEvidence,
  assertProductionArtifactContext,
  assertProductionWorkflowContext,
  runProductionDataPhase,
  validatePromotionEvidence,
  verifySignedEvidence,
} from "./production-executor-lib.mjs";
import { captureRemoteInvariantSnapshot, compareProductionInvariants } from "./invariant-capture-lib.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}
const baseChildEnv = Object.fromEntries(["PATH", "HOME", "CI", "FORCE_COLOR", "NO_COLOR"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const cloudflareChildEnv = { ...baseChildEnv, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID };
function run(command, args, env = baseChildEnv) {
  return execFileSync(command, args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 20 * 1024 * 1024 });
}
function pnpm(args) { return run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, cloudflareChildEnv); }

const mode = process.argv[2];
const requestPath = arg("--request");
const evidencePath = arg("--evidence");
const approvalPath = arg("--approval");
const outputPath = arg("--output");
const reportDirectory = arg("--report-dir") ?? "tmp/data-reports/production";
const sensitiveDirectory = "tmp/production-sensitive";
const plaintextBackup = path.join(sensitiveDirectory, `production-recovery-${process.env.GITHUB_SHA ?? "unknown"}.sql`);
const cleanupPlaintext = () => { if (existsSync(plaintextBackup)) unlinkSync(plaintextBackup); };
process.once("SIGINT", () => { cleanupPlaintext(); process.exit(130); });
process.once("SIGTERM", () => { cleanupPlaintext(); process.exit(143); });
let report;
let requestSnapshot = {
  commit: process.env.GITHUB_SHA ?? "unknown",
  target: { environment: "production", databaseName: "unread-request", databaseId: null },
  migrationRange: { from: null, to: null },
};
const operationState = {
  activeStep: null,
  attemptedSteps: [],
  completedSteps: [],
  results: {},
};
try {
  if (!requestPath) throw new Error("Protected executor requires --request.");
  const requestInput = JSON.parse(readFileSync(requestPath, "utf8"));
  requestSnapshot = {
    commit: requestInput?.commit ?? process.env.GITHUB_SHA ?? "unknown",
    target: { environment: "production", ...(requestInput?.database ?? {}) },
    migrationRange: requestInput?.migrationRange ?? { from: null, to: null },
  };
  const request = validatePromotionEvidence(requestInput);
  const context = mode === "data"
    ? assertProductionWorkflowContext({ env: process.env, expectedCommit: request.commit })
    : assertProductionArtifactContext({ env: process.env, expectedCommit: request.commit });

  if (mode === "verify-deploy") {
    if (!evidencePath) throw new Error("Deploy verification requires --evidence.");
    const payload = assertDeployEvidence({
      signedEvidence: JSON.parse(readFileSync(evidencePath, "utf8")),
      commit: request.commit,
      database: request.database,
    });
    console.log(`Authorized exact deploy ${payload.commit} after protected data gates.`);
    process.exit(0);
  }
  if (mode !== "data" || !outputPath) throw new Error("Protected executor mode must be data or verify-deploy; data requires --output.");
  if (!approvalPath) throw new Error("Protected data executor requires recorded GitHub approval evidence.");
  const approval = JSON.parse(readFileSync(approvalPath, "utf8"));

  const database = request.database;
  let pendingObserved = [];
  let preInvariantSnapshot = null;
  const evidence = runProductionDataPhase({
    commit: request.commit,
    database,
    pendingMigrations: request.pendingMigrations,
    approval,
    run: (step) => {
      operationState.activeStep = step;
      operationState.attemptedSteps.push(step);
      let output = "";
      const identityChecks = [];
      const identityBound = (operation, args) => {
        const result = runProductionIdentityBoundCommand({
          environment: "production",
          database,
          operation,
          commandArgs: args,
          runWrangler: (wranglerArgs) => pnpm(["exec", "wrangler", ...wranglerArgs]),
        });
        identityChecks.push(result.observedIdentity);
        return result.output;
      };
      const captureInvariants = (phase) => captureRemoteInvariantSnapshot({
        database: database.databaseName,
        key: process.env.PRODUCTION_INVARIANT_HMAC_KEY,
        runWrangler: (args) => identityBound(`${phase}-invariant-query`, args),
      });
      switch (step) {
        case "identity": {
          output = pnpm(["exec", "wrangler", "d1", "info", database.databaseName, "--json"]);
          const live = extractD1Identity(output);
          if (live.databaseId !== database.databaseId || live.databaseName !== database.databaseName) throw new Error("Production database allowlist identity mismatch.");
          break;
        }
        case "recovery-bookmark":
          output = identityBound("recovery-bookmark", ["d1", "time-travel", "info", database.databaseName, "--json"]);
          break;
        case "recovery-export": {
          const encryptedBackup = path.join(reportDirectory, `production-recovery-${request.commit}.sql.enc`);
          mkdirSync(reportDirectory, { recursive: true });
          mkdirSync(sensitiveDirectory, { recursive: true });
          output = identityBound("recovery-export", ["d1", "export", database.databaseName, "--remote", "--output", plaintextBackup]);
          try {
            output += run("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-in", plaintextBackup, "-out", encryptedBackup, "-pass", "env:PRODUCTION_BACKUP_ENCRYPTION_KEY"], { ...baseChildEnv, PRODUCTION_BACKUP_ENCRYPTION_KEY: process.env.PRODUCTION_BACKUP_ENCRYPTION_KEY });
          } finally {
            cleanupPlaintext();
          }
          break;
        }
        case "reviewed-pending-range":
          output = identityBound("reviewed-pending-range", ["d1", "migrations", "list", database.databaseName, "--remote"]);
          pendingObserved = parsePendingMigrationNames(output);
          if (JSON.stringify(pendingObserved) !== JSON.stringify(request.pendingMigrations)) throw new Error("Live pending migrations differ from the reviewed migration range.");
          break;
        case "pre-invariants":
          preInvariantSnapshot = captureInvariants("pre");
          output = JSON.stringify(preInvariantSnapshot);
          break;
        case "post-invariants": {
          const post = captureInvariants("post");
          const comparison = compareProductionInvariants({
            pre: preInvariantSnapshot.invariants,
            post: post.invariants,
            preHasEvolution: preInvariantSnapshot.hasEvolution,
            postHasEvolution: post.hasEvolution,
            preDomain: preInvariantSnapshot.domain,
            postDomain: post.domain,
          });
          if (comparison.verdict !== "pass") throw new Error(`Production invariant comparison failed: ${comparison.failures.join("; ")}`);
          output = JSON.stringify(comparison);
          break;
        }
        case "migration-apply":
          output = identityBound("migration-apply", ["d1", "migrations", "apply", database.databaseName, "--remote"]);
          break;
        case "ledger-clean":
          output = identityBound("post-apply-ledger", ["d1", "migrations", "list", database.databaseName, "--remote"]);
          if (parsePendingMigrationNames(output).length) throw new Error("Production ledger remains behind after migration apply.");
          break;
        case "schema-contract":
          output = pnpm(["run", "check:prod:d1-schema", "--", "--report-dir", reportDirectory]);
          break;
        default:
          throw new Error(`Unknown protected data step: ${step}.`);
      }
      mkdirSync(reportDirectory, { recursive: true });
      const artifact = path.join(reportDirectory, `${step}.txt`);
      writeFileSync(artifact, output, { mode: 0o600 });
      const result = { verdict: "pass", artifact, outputLength: output.length, identityChecks };
      operationState.results[step] = result;
      operationState.completedSteps.push(step);
      operationState.activeStep = null;
      return result;
    },
  });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  report = {
    check: "protected-production-data-promotion",
    verdict: "pass",
    commit: request.commit,
    target: { environment: "production", ...database },
    migrationRange: request.migrationRange,
    recovery: { bookmark: "captured", export: "captured" },
    pendingMigrations: pendingObserved,
    context,
    operations: operationState,
  };
  const summary = `PASS protected production data promotion for ${request.commit}; recovery captured and ${request.migrationRange.from} -> ${request.migrationRange.to} verified.`;
  writeDataCheckReports({ name: "production-data-promotion", report, summary, reportDirectory });
  console.log(summary);
} catch (error) {
  cleanupPlaintext();
  const message = error instanceof Error ? error.message : String(error);
  if (operationState.activeStep) {
    operationState.results[operationState.activeStep] = { verdict: "fail", error: message };
  }
  report = {
    check: "protected-production-data-promotion",
    verdict: "fail",
    commit: requestSnapshot.commit,
    target: requestSnapshot.target,
    migrationRange: requestSnapshot.migrationRange,
    operations: operationState,
    error: message,
  };
  const summary = `BLOCKED protected production executor: ${report.error}`;
  writeDataCheckReports({ name: "production-data-promotion", report, summary, reportDirectory });
  console.error(summary);
  process.exitCode = 1;
}
