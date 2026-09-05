#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";
import { assertSanitizerSourceWorkflowContext } from "./workflow-request-context-lib.mjs";
import { runRepositoryGit } from "./git-subprocess-env.mjs";
import { safeCanaryFailure, wrapCanarySubprocessFailure } from "./canary-diagnostics.mjs";

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

const operation = process.argv[2];
const databaseName = arg("--database-name");
const databaseId = arg("--database-id");
const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
function resolveInside(value, relativeRoot, label) {
  if (!value) return null;
  const root = path.join(repoRoot, relativeRoot);
  const resolved = path.resolve(repoRoot, value);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${label} must stay under ${relativeRoot}.`);
  return resolved;
}
let output;
let evidence;
const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const runWrangler = (args) => execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", ...args], { cwd: repoRoot, encoding: "utf8", env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
let stage = "production-identity-bound-configuration";

try {
  output = resolveInside(arg("--output"), "tmp/production-sensitive", "Production export");
  evidence = resolveInside(arg("--evidence"), "tmp/data-evidence", "Production identity evidence");
  if (operation !== "sanitizer-export" || !databaseName || !databaseId || !output || !evidence) {
    throw new Error("Production identity-bound CLI permits only sanitizer-export with complete arguments.");
  }
  const gitCommit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim();
  assertSanitizerSourceWorkflowContext({ env: process.env, gitCommit });
  stage = "production-identity-bound-command";
  const result = runProductionIdentityBoundCommand({
    environment: "production",
    database: { databaseName, databaseId },
    operation,
    commandArgs: ["d1", "export", databaseName, "--remote", "--no-schema", "--output", output],
    runWrangler: (args) => {
      try { return runWrangler(args); }
      catch (error) { throw wrapCanarySubprocessFailure(stage, error); }
    },
  });
  mkdirSync(path.dirname(evidence), { recursive: true });
  writeFileSync(evidence, `${JSON.stringify({ verdict: "pass", commit: gitCommit, ...result.observedIdentity, operation }, null, 2)}\n`, { mode: 0o600 });
} catch (error) {
  let reportedError = error;
  if (output && existsSync(output)) {
    try { unlinkSync(output); }
    catch (cleanupError) {
      stage = "production-identity-bound-cleanup";
      reportedError = cleanupError;
    }
  }
  const failure = safeCanaryFailure(stage, reportedError);
  console.error(JSON.stringify({ check: "production-identity-bound-command", verdict: "fail", failedStage: failure.stage, errorCode: failure.code, error: failure.message, ...(failure.exitStatus === undefined ? {} : { exitStatus: failure.exitStatus }) }));
  process.exitCode = 1;
}
