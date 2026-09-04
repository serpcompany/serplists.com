#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertWorkflowRequestContext } from "./workflow-request-context-lib.mjs";
import { generateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}.`);
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
  const allowedRoot = path.join(repoRoot, "tmp/data-evidence");
  const resolved = path.resolve(repoRoot, value);
  if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("Sanitizer raw input must stay under ignored tmp/data-evidence/.");
  }
  if (existsSync(resolved)) {
    const realPath = realpathSync(resolved);
    const realAllowedRoot = realpathSync(allowedRoot);
    if (realPath !== realAllowedRoot && !realPath.startsWith(`${realAllowedRoot}${path.sep}`)) {
      throw new Error("Sanitizer raw input must stay under ignored tmp/data-evidence/.");
    }
  }
  return resolved;
}

let rawInputPathForCleanup;
let shouldCleanupRawInput = false;

try {
  const { values, flags } = parseArgs(process.argv.slice(2));
  const inputPath = resolveRawInput(requireValue(values, "--input"));
  rawInputPathForCleanup = inputPath;
  shouldCleanupRawInput = flags.has("--execute");
  const outputPath = resolveOutput(requireValue(values, "--output"));
  const manifestPath = resolveOutput(requireValue(values, "--manifest"));
  const sourceDatabaseId = requireValue(values, "--source-database-id");
  const sourceDate = requireValue(values, "--source-date");
  const approverIdentity = requireValue(values, "--approver-identity");
  const retentionDeadline = requireValue(values, "--retention-deadline");
  const issueNumber = Number(requireValue(values, "--issue"));
  const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (new Set([inputPath, outputPath, manifestPath]).size !== 3) {
    throw new Error("Sanitizer input, output, and manifest paths must be distinct.");
  }

  const plan = {
    sanitizer: "synthetic-production-shaped-v1",
    inputPath,
    outputPath,
    manifestPath,
    sourceDate,
    issueNumber,
    requestedApproverIdentity: approverIdentity,
    gitCommit,
  };
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!flags.has("--execute")) process.exit(0);

  assertWorkflowRequestContext({
    env: process.env,
    gitCommit,
    targetEnvironment: "rehearsal",
    requestedApproverIdentity: approverIdentity,
  });
  const artifact = generateSanitizedRehearsalArtifact({
    repoRoot,
    rawExport: readFileSync(inputPath, "utf8"),
    sourceDatabaseId,
    sourceDate,
    gitCommit,
    issueNumber,
    requestedApproverIdentity: approverIdentity,
    generatedAt: new Date(),
    retentionDeadline,
  });
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
    retentionDeadline: artifact.manifest.retentionDeadline,
  }, null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (
    shouldCleanupRawInput &&
    rawInputPathForCleanup &&
    existsSync(rawInputPathForCleanup)
  ) {
    unlinkSync(rawInputPathForCleanup);
  }
}
