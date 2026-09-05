#!/usr/bin/env node
import { normalizeMigrationRange, migrationRangeForReport } from "./migration-range-lib.mjs";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertSanitizerSourceWorkflowContext } from "./workflow-request-context-lib.mjs";
import { generateSanitizedRehearsalArtifact, loadSanitizerPolicy, resolveSanitizerProfile } from "./sanitizer-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { runRepositoryGit } from "./git-subprocess-env.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!token.startsWith("--")) throw new Error("Unexpected sanitizer argument.");
    if (!next || next.startsWith("--")) flags.add(token);
    else {
      values[token] = next;
      index += 1;
    }
  }
  return { values, flags };
}

function requireValue(values, name) {
  const value = values[name];
  if (!value) throw new Error(`Sanitizer requires ${name}.`);
  return value;
}

function resolveOutput(value) {
  const allowedRoot = path.join(repoRoot, "tmp/data-evidence");
  const resolved = path.resolve(repoRoot, value);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("Sanitizer outputs must stay under ignored tmp/data-evidence/.");
  }
  return resolved;
}

function resolveRawInput(value) {
  const allowedRoot = path.join(repoRoot, "tmp/production-sensitive");
  const resolved = path.resolve(repoRoot, value);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("Sanitizer raw input must stay under non-artifact tmp/production-sensitive/.");
  }
  if (existsSync(resolved)) {
    const realPath = realpathSync(resolved);
    const realAllowedRoot = realpathSync(allowedRoot);
    if (realPath !== realAllowedRoot && !realPath.startsWith(`${realAllowedRoot}${path.sep}`)) {
      throw new Error("Sanitizer raw input must stay under non-artifact tmp/production-sensitive/.");
    }
  }
  return resolved;
}

let rawInputPathForCleanup;
let shouldCleanupRawInput = false;
let reportDirectory = path.join(repoRoot, "tmp/data-reports/sanitizer");
let reportContext = { commit: "unknown", target: { environment: "production", binding: "DB", databaseName: "unknown", databaseId: "unknown" }, migrationRange: { from: "unknown", to: "unknown" }, sanitizerVersion: "source-derived-shape-v5" };
let stage = "arguments";
const rejectionMessages = {
  arguments: "Sanitizer arguments rejected.",
  paths: "Sanitizer raw input must stay under non-artifact tmp/production-sensitive/; outputs require constrained distinct paths.",
  profile: "Sanitizer reviewed range/source profile rejected.",
  owner: "Sanitizer requires an allowlisted access owner.",
  workflow: "Sanitizer workflow request context rejected.",
  identity: "Sanitizer requires exact identity-bound production export evidence.",
  source: "Sanitizer protected source validation rejected.",
  artifact: "Sanitizer artifact write failed.",
  reporting: "Sanitizer report write failed.",
  cleanup: "Sanitizer raw source cleanup failed.",
};
function reportFailure() {
  const code = `SANITIZER_${stage.toUpperCase()}_REJECTED`;
  const message = `${code}: ${rejectionMessages[stage]}`;
  reportContext.migrationRange = migrationRangeForReport(reportContext.migrationRange);
  try {
    writeDataCheckReports({ name: "sanitize-production-export", report: { check: "sanitize-production-export", verdict: "fail", ...reportContext, stage, code, error: message }, summary: `BLOCKED sanitizer commit=${reportContext.commit} environment=${reportContext.target.environment} binding=${reportContext.target.binding} database=${reportContext.target.databaseName} databaseId=${reportContext.target.databaseId} migration=${reportContext.migrationRange.from}->${reportContext.migrationRange.to} sanitizer=${reportContext.sanitizerVersion}: ${message}`, reportDirectory });
  } catch { console.error("SANITIZER_REPORTING_REJECTED: Sanitizer report write failed."); }
  console.error(message);
  process.exitCode = 1;
}

try {
  const gitCommit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim();
  const productionIdentity = JSON.parse(readFileSync(path.join(repoRoot, "scripts/data/environment-inventory.json"), "utf8")).environments.production;
  reportContext = { ...reportContext, commit: gitCommit, target: { environment: "production", binding: "DB", databaseName: productionIdentity.databaseName, databaseId: productionIdentity.databaseId } };
  const { values, flags } = parseArgs(process.argv.slice(2));
  const requestedReportDirectory = path.resolve(repoRoot, values["--report-dir"] ?? "tmp/data-reports/sanitizer");
  const allowedReportRoot = path.join(repoRoot, "tmp/data-reports");
  if (requestedReportDirectory !== allowedReportRoot && !requestedReportDirectory.startsWith(`${allowedReportRoot}${path.sep}`)) throw new Error("Sanitizer report directory must stay under ignored tmp/data-reports/.");
  reportDirectory = requestedReportDirectory;
  stage = "paths";
  const inputPath = resolveRawInput(requireValue(values, "--input"));
  rawInputPathForCleanup = inputPath;
  shouldCleanupRawInput = flags.has("--execute");
  const outputPath = resolveOutput(requireValue(values, "--output"));
  const manifestPath = resolveOutput(requireValue(values, "--manifest"));
  const sourceDate = requireValue(values, "--source-date");
  const approverIdentity = requireValue(values, "--approver-identity");
  const retentionDeadline = requireValue(values, "--retention-deadline");
  const issueNumber = Number(requireValue(values, "--issue"));
  const migrationFrom = requireValue(values, "--migration-from");
  const migrationTo = requireValue(values, "--migration-to");
  stage = "profile";
  const reviewedRange = normalizeMigrationRange({ from: migrationFrom, to: migrationTo });
  const repositoryMigrations = readdirSync(path.join(repoRoot, "db/migrations")).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name));
  if (reviewedRange.from !== null && (!repositoryMigrations.includes(reviewedRange.from) || !repositoryMigrations.includes(reviewedRange.to))) throw new Error("Unknown reviewed migration range.");
  reportContext.migrationRange = reviewedRange;
  const sourceSchema = requireValue(values, "--source-schema");
  reportContext.sourceProfile = resolveSanitizerProfile({ repoRoot, migrationRange: reviewedRange, sourceSchema });
  reportContext.migrationRange = reportContext.sourceProfile.migrationRange;
  stage = "paths";
  if (new Set([inputPath, outputPath, manifestPath]).size !== 3) {
    throw new Error("Sanitizer input, output, and manifest paths must be distinct.");
  }

  stage = "owner";
  if (!loadSanitizerPolicy({ repoRoot }).allowedAccessOwners.includes(approverIdentity)) throw new Error("Unapproved owner.");
  const plan = {
    sanitizer: "source-derived-shape-v5",
    issueNumber: Number.isSafeInteger(issueNumber) ? issueNumber : null,
    requestedApproverIdentity: approverIdentity,
    gitCommit,
    target: reportContext.target,
    sourceProfile: reportContext.sourceProfile,
  };
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!flags.has("--execute")) process.exit(0);

  stage = "workflow";
  assertSanitizerSourceWorkflowContext({ env: process.env, gitCommit });
  stage = "identity";
  const sourceIdentityPath = resolveOutput(requireValue(values, "--source-identity-evidence"));
  const sourceIdentity = JSON.parse(readFileSync(sourceIdentityPath, "utf8"));
  if (sourceIdentity.verdict !== "pass" || sourceIdentity.commit !== gitCommit || sourceIdentity.environment !== "production" ||
      sourceIdentity.binding !== "DB" || sourceIdentity.databaseName !== productionIdentity.databaseName ||
      sourceIdentity.databaseId !== productionIdentity.databaseId || sourceIdentity.before?.databaseId !== productionIdentity.databaseId ||
      sourceIdentity.after?.databaseId !== productionIdentity.databaseId) {
    throw new Error("Sanitizer requires exact identity-bound production export evidence.");
  }
  const sourceDatabaseId = sourceIdentity.databaseId;
  reportContext.target.databaseId = sourceDatabaseId;
  stage = "source";
  const artifact = generateSanitizedRehearsalArtifact({
    repoRoot,
    rawExport: readFileSync(inputPath, "utf8"),
    migrationRange: reportContext.migrationRange,
    sourceSchema,
    sourceDatabaseId,
    sourceDate,
    gitCommit,
    issueNumber,
    requestedApproverIdentity: approverIdentity,
    generatedAt: new Date(),
    retentionDeadline,
  });
  stage = "artifact";
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, artifact.sql, { encoding: "utf8", mode: 0o600 });
  writeFileSync(manifestPath, `${JSON.stringify(artifact.manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(outputPath, 0o600);
  chmodSync(manifestPath, 0o600);
  process.stdout.write(`${JSON.stringify({
    verdict: "pass",
    artifactSha256: artifact.manifest.artifact.sha256,
    manifestIntegritySha256: artifact.manifest.manifestIntegritySha256,
    retentionDeadline: artifact.manifest.handling.retentionDeadline,
  }, null, 2)}\n`);
  const report = { check: "sanitize-production-export", verdict: "pass", ...reportContext, sourceDate: artifact.manifest.provenance.sourceDate, accessOwner: artifact.manifest.handling.accessOwner, retentionDeadline: artifact.manifest.handling.retentionDeadline, selectedCounts: artifact.manifest.selection.selectedCounts, coveredShapes: artifact.manifest.selection.coveredShapes, artifactSha256: artifact.manifest.artifact.sha256 };
  stage = "reporting";
  writeDataCheckReports({ name: "sanitize-production-export", report, summary: `PASS sanitizer commit=${report.commit} environment=production binding=DB database=${report.target.databaseName} databaseId=${report.target.databaseId} migration=${migrationFrom}->${migrationTo} sanitizer=${report.sanitizerVersion}.`, reportDirectory });
} catch {
  reportFailure();
} finally {
  if (
    shouldCleanupRawInput &&
    rawInputPathForCleanup &&
    existsSync(rawInputPathForCleanup)
  ) {
    try { unlinkSync(rawInputPathForCleanup); }
    catch { stage = "cleanup"; reportFailure(); }
  }
}
