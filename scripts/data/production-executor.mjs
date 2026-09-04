#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  assertDeployEvidence,
  assertProductionArtifactContext,
  compareProductionInvariants,
  parseInvariantOutput,
  privacySafeOwnershipDigest,
  assertProductionWorkflowContext,
  runProductionDataPhase,
  validatePromotionEvidence,
  verifySignedEvidence,
} from "./production-executor-lib.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";

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
try {
  if (!requestPath) throw new Error("Protected executor requires --request.");
  const request = validatePromotionEvidence(JSON.parse(readFileSync(requestPath, "utf8")));
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
  let preInvariants = null;
  const ownershipDigest = () => {
    const ownerSql = "SELECT 'template' kind,id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END deleted_state FROM templates UNION ALL SELECT 'run',id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END FROM checklist_runs";
    const raw = pnpm(["exec", "wrangler", "d1", "execute", database.databaseName, "--remote", "--json", "--command", ownerSql]);
    const parsed = JSON.parse(raw);
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry.results ?? []);
    return privacySafeOwnershipDigest({ rows, key: process.env.PRODUCTION_BACKUP_ENCRYPTION_KEY });
  };
  const evidence = runProductionDataPhase({
    commit: request.commit,
    database,
    pendingMigrations: request.pendingMigrations,
    approval,
    run: (step) => {
      let output = "";
      switch (step) {
        case "identity": {
          output = pnpm(["exec", "wrangler", "d1", "info", database.databaseName, "--json"]);
          const live = extractD1Identity(output);
          if (live.databaseId !== database.databaseId || live.databaseName !== database.databaseName) throw new Error("Production database allowlist identity mismatch.");
          break;
        }
        case "recovery-bookmark":
          output = pnpm(["exec", "wrangler", "d1", "time-travel", "info", database.databaseName, "--json"]);
          break;
        case "recovery-export": {
          const encryptedBackup = path.join(reportDirectory, `production-recovery-${request.commit}.sql.enc`);
          mkdirSync(reportDirectory, { recursive: true });
          mkdirSync(sensitiveDirectory, { recursive: true });
          output = pnpm(["exec", "wrangler", "d1", "export", database.databaseName, "--remote", "--output", plaintextBackup]);
          try {
            output += run("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-in", plaintextBackup, "-out", encryptedBackup, "-pass", "env:PRODUCTION_BACKUP_ENCRYPTION_KEY"], { ...baseChildEnv, PRODUCTION_BACKUP_ENCRYPTION_KEY: process.env.PRODUCTION_BACKUP_ENCRYPTION_KEY });
          } finally {
            cleanupPlaintext();
          }
          break;
        }
        case "reviewed-pending-range":
          output = pnpm(["exec", "wrangler", "d1", "migrations", "list", database.databaseName, "--remote"]);
          pendingObserved = parsePendingMigrationNames(output);
          if (JSON.stringify(pendingObserved) !== JSON.stringify(request.pendingMigrations)) throw new Error("Live pending migrations differ from the reviewed migration range.");
          break;
        case "pre-invariants":
          output = pnpm(["exec", "wrangler", "d1", "execute", database.databaseName, "--remote", "--json", "--file", "scripts/data/sql/capture-invariants.sql"]);
          if (!request.pendingMigrations.includes("0024_safe_template_evolution.sql")) {
            const versionedPre = pnpm(["exec", "wrangler", "d1", "execute", database.databaseName, "--remote", "--json", "--file", "scripts/data/sql/capture-invariants-0024.sql"]);
            output = JSON.stringify([...JSON.parse(output), ...JSON.parse(versionedPre)]);
          }
          preInvariants = parseInvariantOutput(output);
          preInvariants.ownershipDigest = ownershipDigest();
          output = JSON.stringify(preInvariants);
          break;
        case "post-invariants": {
          const baseline = pnpm(["exec", "wrangler", "d1", "execute", database.databaseName, "--remote", "--json", "--file", "scripts/data/sql/capture-invariants.sql"]);
          const versioned = pnpm(["exec", "wrangler", "d1", "execute", database.databaseName, "--remote", "--json", "--file", "scripts/data/sql/capture-invariants-0024.sql"]);
          output = JSON.stringify([...JSON.parse(baseline), ...JSON.parse(versioned)]);
          const post = parseInvariantOutput(output);
          post.ownershipDigest = ownershipDigest();
          const comparison = compareProductionInvariants({ pre: preInvariants, post, preHasEvolution: !request.pendingMigrations.includes("0024_safe_template_evolution.sql"), postHasEvolution: true });
          if (comparison.verdict !== "pass") throw new Error(`Production invariant comparison failed: ${comparison.failures.join("; ")}`);
          output = JSON.stringify(comparison);
          break;
        }
        case "migration-apply":
          output = pnpm(["exec", "wrangler", "d1", "migrations", "apply", database.databaseName, "--remote"]);
          break;
        case "ledger-clean":
          output = pnpm(["exec", "wrangler", "d1", "migrations", "list", database.databaseName, "--remote"]);
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
      return { verdict: "pass", artifact, outputLength: output.length };
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
  };
  const summary = `PASS protected production data promotion for ${request.commit}; recovery captured and ${request.migrationRange.from} -> ${request.migrationRange.to} verified.`;
  writeDataCheckReports({ name: "production-data-promotion", report, summary, reportDirectory });
  console.log(summary);
} catch (error) {
  cleanupPlaintext();
  report = {
    check: "protected-production-data-promotion",
    verdict: "fail",
    commit: process.env.GITHUB_SHA ?? "unknown",
    target: { environment: "production", databaseName: "requested-in-evidence", databaseId: null },
    migrationRange: { from: null, to: null },
    error: error instanceof Error ? error.message : String(error),
  };
  const summary = `BLOCKED protected production executor: ${report.error}`;
  writeDataCheckReports({ name: "production-data-promotion", report, summary, reportDirectory });
  console.error(summary);
  process.exitCode = 1;
}
