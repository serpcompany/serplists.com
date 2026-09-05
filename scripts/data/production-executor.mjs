#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from 'node:os';
import path from "node:path";
import { tsImport } from 'tsx/esm/api';
import {
  assertDeployEvidence,
  assertApprovalMatchesRequest,
  assertProductionArtifactContext,
  assertProductionWorkflowContext,
  runProductionDataPhase,
  validatePromotionEvidence,
  verifySignedEvidence,
} from "./production-executor-lib.mjs";
import { captureRemoteInvariantSnapshot, compareProductionInvariants, parseAppliedMigrationLedger } from "./invariant-capture-lib.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";
import { prepareProduction, verifyRecoveryBundle, digest, assertRepositoryAppliedPrefix, assertRecoveryFreshness, repositoryMigrationHistory } from "./production-preparation-lib.mjs";
import { safeCanaryFailure, wrapCanarySubprocessFailure } from './canary-diagnostics.mjs';
import { loadEnvironmentInventory, validateEnvironmentInventory } from "./environment-identity-lib.mjs";
import { validateReportIdentity, reportIdentitySummary } from './report-identity-lib.mjs';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}
const baseChildEnv = Object.fromEntries(["PATH", "HOME", "CI", "FORCE_COLOR", "NO_COLOR"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const cloudflareChildEnv = { ...baseChildEnv, CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID };
function run(command, args, env = baseChildEnv) {
  try {
    return execFileSync(command, args, { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    throw wrapCanarySubprocessFailure(`production-${operationState.activeStep ?? 'configuration'}`, error);
  }
}
function pnpm(args) { return run(process.platform === "win32" ? "pnpm.cmd" : "pnpm", args, cloudflareChildEnv); }
function extractBookmark(output) {
  let parsed;
  try { parsed = JSON.parse(output); } catch { throw new Error("Production recovery bookmark output is not valid JSON."); }
  const queue = [parsed];
  while (queue.length) {
    const value = queue.shift();
    if (value && typeof value === "object") {
      if (typeof value.bookmark === "string" && value.bookmark.trim()) return value.bookmark.trim();
      queue.push(...(Array.isArray(value) ? value : Object.values(value)));
    }
  }
  throw new Error("Production recovery bookmark output does not contain a bookmark.");
}

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
  commit: 'unknown',
  target: { environment: "production", binding: 'unknown', databaseName: "unread-request", databaseId: 'unknown' },
  migrationRange: { from: 'invalid', to: 'invalid' },
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
  const reportIdentity = validateReportIdentity({ commit: requestInput?.commit, target: { environment: 'production', binding: 'DB', databaseName: requestInput?.database?.databaseName, databaseId: requestInput?.database?.databaseId }, migrationRange: requestInput?.migrationRange });
  requestSnapshot = reportIdentity;
  const knownMigrations = repositoryMigrationHistory();
  const request = validatePromotionEvidence(requestInput);
  if (mode === "prepare" && process.env.DATA_PROTECTED_ENVIRONMENT !== "production-preparation") throw new Error("Recovery preparation requires the protected read-only environment.");
  const context = ["data", "prepare"].includes(mode)
    ? assertProductionWorkflowContext({ env: mode === "prepare" ? { ...process.env, DATA_PROTECTED_ENVIRONMENT: "production" } : process.env, expectedCommit: request.commit })
    : assertProductionArtifactContext({ env: process.env, expectedCommit: request.commit });

  if (mode === "verify-deploy") {
    if (!evidencePath) throw new Error("Deploy verification requires --evidence.");
    const payload = assertDeployEvidence({
      signedEvidence: JSON.parse(readFileSync(evidencePath, "utf8")),
      commit: request.commit,
      database: request.database,
      request,
    });
    console.log(`Authorized exact deploy ${payload.commit} after protected data gates.`);
    process.exit(0);
  }
  if (!["data", "prepare"].includes(mode) || !outputPath) throw new Error("Protected executor requires prepare/data with --output or verify-deploy.");
  let approval, preparation, receipt;
  if (mode === "data") {
    if (!approvalPath || !arg("--preparation") || !arg("--encrypted-export")) throw new Error("Protected execution requires durable preparation and approval.");
    approval = JSON.parse(readFileSync(approvalPath, "utf8"));
    assertApprovalMatchesRequest({ approval, request });
    preparation = JSON.parse(readFileSync(arg("--preparation"), "utf8"));
    receipt = verifyRecoveryBundle({ request, preparation, encrypted: readFileSync(arg("--encrypted-export")), expectedDigest: arg("--preparation-digest"), artifactId: arg("--artifact-id"), context });
  }

  const database = { databaseName: request.database.databaseName, databaseId: request.database.databaseId };
  let pendingObserved = [];
  let preInvariantSnapshot = null;
  const { inspectSourceSchema } = await tsImport('./source-schema.ts', import.meta.url);
  let sourceSchemaProof = null;
  const orchestrate = mode === "prepare" ? prepareProduction : runProductionDataPhase;
  const evidence = orchestrate({
    request, context, preparation, receipt,
    commit: request.commit,
    database,
    pendingMigrations: request.pendingMigrations,
    classification: request.classification,
    approval,
    run: (step) => {
      operationState.activeStep = step;
      operationState.attemptedSteps.push(step);
      let output = "";
      let summary = null;
      const identityChecks = [];
      const identityBound = (operation, args) => {
        const result = runProductionIdentityBoundCommand({
          environment: "production",
          database,
          operation,
          commandArgs: args,
          runWrangler: (wranglerArgs) => {
            if (wranglerArgs.slice(0, 3).join(' ') === 'd1 migrations apply') assertRecoveryFreshness(preparation);
            return pnpm(["exec", "wrangler", ...wranglerArgs]);
          },
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
          const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
          const inventory = loadEnvironmentInventory({ repoRoot });
          validateEnvironmentInventory({ inventory, wranglerToml: readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8") });
          if (inventory.environments.production.databaseId !== database.databaseId || inventory.environments.production.databaseName !== database.databaseName) throw new Error("Production request differs from checked-out identity allowlist.");
          output = pnpm(["exec", "wrangler", "d1", "info", database.databaseName, "--json"]);
          const live = extractD1Identity(output);
          if (live.databaseId !== database.databaseId || live.databaseName !== database.databaseName) throw new Error("Production database allowlist identity mismatch.");
          summary = { type: step, databaseName: live.databaseName, databaseId: live.databaseId };
          break;
        }
        case "recovery-bookmark":
          output = identityBound("recovery-bookmark", ["d1", "time-travel", "info", database.databaseName, "--json"]);
          summary = { type: step, captured: true, bookmark: extractBookmark(output) };
          break;
        case "recovery-export": {
          const encryptedBackup = path.join(reportDirectory, `production-recovery-${request.commit}.sql.enc`);
          mkdirSync(reportDirectory, { recursive: true });
          mkdirSync(sensitiveDirectory, { recursive: true });
          output = identityBound("recovery-export", ["d1", "export", database.databaseName, "--remote", "--output", plaintextBackup]);
          try {
            output += run("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-salt", "-in", plaintextBackup, "-out", encryptedBackup, "-pass", "env:PRODUCTION_BACKUP_ENCRYPTION_KEY"], { ...baseChildEnv, PRODUCTION_BACKUP_ENCRYPTION_KEY: process.env.PRODUCTION_BACKUP_ENCRYPTION_KEY });
            const encrypted = readFileSync(encryptedBackup);
            summary = { type: step, encryptedBackupSha256: createHash("sha256").update(encrypted).digest("hex"), encryptedBackupByteLength: encrypted.byteLength };
          } finally {
            cleanupPlaintext();
          }
          break;
        }
        case "reviewed-pending-range":
          output = identityBound("reviewed-pending-range", ["d1", "migrations", "list", database.databaseName, "--remote"]);
          pendingObserved = parsePendingMigrationNames(output, request.pendingMigrations);
          if (JSON.stringify(pendingObserved) !== JSON.stringify(request.pendingMigrations)) throw new Error("Live pending migrations differ from the reviewed migration range.");
          summary = { type: step, pendingMigrations: [...pendingObserved], from: request.migrationRange.from, to: request.migrationRange.to };
          break;
        case "pre-invariants":
          preInvariantSnapshot = captureInvariants("pre");
          output = JSON.stringify(preInvariantSnapshot);
          assertRepositoryAppliedPrefix({ ...preInvariantSnapshot, pendingMigrations: request.pendingMigrations });
          summary = { type: step, invariantCount: Object.keys(preInvariantSnapshot.invariants).length, appliedThrough: preInvariantSnapshot.appliedThrough, appliedMigrations: preInvariantSnapshot.appliedMigrations, ledgerSha256: preInvariantSnapshot.ledgerSha256, domainDigest: preInvariantSnapshot.domain.digest };
          break;
        case "source-schema":
          sourceSchemaProof = inspectSourceSchema({ commit: request.commit, database, pendingMigrations: request.pendingMigrations, wrapFailure: wrapCanarySubprocessFailure,
            execute: sql => identityBound('source-schema', ['d1', 'execute', database.databaseName, '--remote', '--json', '--command', sql]) });
          summary = sourceSchemaProof;
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
          summary = { type: step, invariantCount: Object.keys(comparison.post).length, failureCount: comparison.failures.length, preDomainDigest: comparison.preDomainDigest, postDomainDigest: comparison.postDomainDigest };
          break;
        }
        case "migration-apply":
          // Re-read after potentially slow invariant queries, then check age after
          // the final identity read and immediately before the mutation command.
          {
            const appliedMigrations = parseAppliedMigrationLedger(identityBound('pre-write-ledger', ['d1', 'execute', database.databaseName, '--remote', '--json', '--command', 'SELECT id, name FROM d1_migrations ORDER BY id']));
            const pendingMigrations = parsePendingMigrationNames(identityBound('pre-write-pending', ['d1', 'migrations', 'list', database.databaseName, '--remote']), knownMigrations);
            if (JSON.stringify(pendingMigrations) !== JSON.stringify(request.pendingMigrations)) throw new Error('Reviewed pending range changed.');
            assertRepositoryAppliedPrefix({ appliedMigrations, pendingMigrations, ledgerSha256: digest(appliedMigrations) });
            const adjacentProof = inspectSourceSchema({ commit: request.commit, database, pendingMigrations, wrapFailure: wrapCanarySubprocessFailure,
              execute: sql => identityBound('source-schema', ['d1', 'execute', database.databaseName, '--remote', '--json', '--command', sql]) });
            if (adjacentProof.proofSha256 !== sourceSchemaProof?.proofSha256) throw new Error('Source catalog changed before apply.');
          }
          output = identityBound("migration-apply", ["d1", "migrations", "apply", database.databaseName, "--remote"]);
          summary = { type: step, appliedMigrations: [...request.pendingMigrations] };
          break;
        case "ledger-clean":
          output = identityBound("post-apply-ledger", ["d1", "migrations", "list", database.databaseName, "--remote"]);
          if (parsePendingMigrationNames(output, request.pendingMigrations).length) throw new Error("Production ledger remains behind after migration apply.");
          summary = { type: step, pendingMigrations: [], appliedThrough: request.migrationRange.to ?? request.ciSchemaContract.migrationRange.to };
          break;
        case "schema-contract": {
          // The child writes detailed schema diagnostics. Keep them out of the
          // publishable artifact directory on both success and failure.
          const privateReports = mkdtempSync(path.join(tmpdir(), 'production-schema-'));
          let schemaEvidence;
          try {
            output = pnpm(["run", "check:prod:d1-schema", "--", "--database-id", database.databaseId, "--report-dir", privateReports]);
            schemaEvidence = JSON.parse(readFileSync(path.join(privateReports, "d1-schema-production.json"), "utf8"));
          } finally { rmSync(privateReports, { recursive: true, force: true }); }
          if (schemaEvidence.verdict !== "pass" || !Array.isArray(schemaEvidence.identityChecks) || schemaEvidence.identityChecks.length === 0) throw new Error("Production schema contract evidence lacks identity-bound D1 checks.");
          for (const check of schemaEvidence.identityChecks) {
            if ([check, check.before, check.after].some(value => value?.databaseName !== database.databaseName || value?.databaseId !== database.databaseId)) throw new Error('Schema identity evidence mismatch.');
            identityChecks.push({ environment: 'production', binding: 'DB', ...database, before: { ...database }, after: { ...database } });
          }
          summary = { type: step, verdict: 'pass', appliedThrough: knownMigrations.at(-1), schemaDigest: createHash("sha256").update(JSON.stringify(schemaEvidence)).digest("hex") };
          break;
        }
        default:
          throw new Error(`Unknown protected data step: ${step}.`);
      }
      mkdirSync(reportDirectory, { recursive: true });
      const artifact = path.join(reportDirectory, `${step}.txt`);
      // Persist only typed privacy-safe summaries, never raw command/customer output.
      output = JSON.stringify(summary);
      writeFileSync(artifact, output, { mode: 0o600 });
      const artifactByteLength = Buffer.byteLength(output);
      const result = { verdict: "pass", artifact, outputLength: artifactByteLength, artifactByteLength, artifactSha256: createHash("sha256").update(output).digest("hex"), summary, identityChecks };
      operationState.results[step] = result;
      operationState.completedSteps.push(step);
      operationState.activeStep = null;
      return result;
    },
  });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  if (mode === "prepare" && process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `preparation_digest=${digest(evidence)}\n`, { flag: "a" });
  report = {
    check: "protected-production-data-promotion",
    verdict: "pass",
    commit: request.commit,
    target: reportIdentity.target,
    migrationRange: request.migrationRange,
    recovery: { bookmark: "captured", export: "captured" },
    pendingMigrations: pendingObserved,
    context,
    preparationSha256: mode === "prepare" ? digest(evidence) : receipt.preparationSha256,
    requestSha256: digest(request),
    checks: [{ name: `request-sha256:${digest(request)}; preparation-sha256:${mode === "prepare" ? digest(evidence) : receipt.preparationSha256}`, verdict: "pass" }],
    operations: operationState,
  };
  const summary = `PASS protected production ${mode}; ${reportIdentitySummary(report)}; request SHA256 ${digest(request)}; preparation SHA256 ${report.preparationSha256}.`;
  writeDataCheckReports({ name: "production-data-promotion", report, summary, reportDirectory });
  console.log(summary);
} catch (error) {
  try { cleanupPlaintext(); } catch (cleanupError) { error = cleanupError; }
  const failure = safeCanaryFailure(`production-${operationState.activeStep ?? 'configuration'}`, error);
  const message = failure.message;
  if (operationState.activeStep) {
    operationState.results[operationState.activeStep] = { verdict: "fail", ...failure };
  }
  report = {
    check: "protected-production-data-promotion",
    verdict: "fail",
    commit: requestSnapshot.commit,
    target: requestSnapshot.target,
    migrationRange: requestSnapshot.migrationRange,
    operations: operationState,
    error: message,
    failure,
  };
  const summary = `BLOCKED protected production executor; ${reportIdentitySummary(report)}: ${report.error}`;
  try { writeDataCheckReports({ name: "production-data-promotion", report, summary, reportDirectory }); }
  catch { console.error('Protected production failure report could not be written.'); }
  console.error(summary);
  process.exitCode = 1;
}
