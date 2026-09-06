#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { fstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { acquireExportDestination, preflightExportDestination } from './sanitizer-export-output-lib.mjs';
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";
import { assertSanitizerSourceWorkflowContext } from "./workflow-request-context-lib.mjs";
import { runRepositoryGit } from "./git-subprocess-env.mjs";
import { safeCanaryFailure, wrapCanarySubprocessFailure } from "./canary-diagnostics.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
let output;
let evidence;
const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
// Invoke the installed CLI directly: pnpm and Wrangler's bin launcher do not
// forward fd 3. The provider writes the held inode, never the caller's path.
const require = createRequire(import.meta.url);
const runWrangler = (args) => execFileSync(process.execPath, ["--no-warnings", "--experimental-vm-modules", '--import', pathToFileURL(path.join(repoRoot, 'scripts/data/sanitizer-export-provider.mjs')).href, path.join(path.dirname(require.resolve('wrangler/package.json')), 'wrangler-dist/cli.js'), ...args], { cwd: repoRoot, encoding: "utf8", env: childEnv, stdio: ["ignore", "pipe", "pipe", output.fd] });
let stage = "production-identity-bound-configuration";

try {
  const [operation, ...args] = process.argv.slice(2);
  const values = {};
  const allowed = ['--database-name', '--database-id', '--output', '--evidence'];
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!allowed.includes(key) || Object.hasOwn(values, key) || !value || value.startsWith('--')) throw new Error('Invalid sanitizer export arguments.');
    values[key] = value;
  }
  const databaseName = values['--database-name'], databaseId = values['--database-id'];
  if (operation !== "sanitizer-export" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(databaseName ?? '') || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId ?? '') || allowed.some(key => !values[key]) || process.platform === 'win32') {
    throw new Error("Production identity-bound CLI permits only sanitizer-export with complete arguments.");
  }
  const gitCommit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim();
  assertSanitizerSourceWorkflowContext({ env: process.env, gitCommit });
  const outputPlan = preflightExportDestination(repoRoot, values['--output'], 'tmp/production-sensitive');
  const evidencePlan = preflightExportDestination(repoRoot, values['--evidence'], 'tmp/data-evidence');
  output = acquireExportDestination(outputPlan);
  // Carry forward only directories this invocation just created, without
  // adopting a replacement of an ancestor observed during preflight.
  for (const parent of evidencePlan.parents) {
    if (!parent.identity) parent.identity = outputPlan.parents.find(item => item.path === parent.path)?.identity ?? null;
  }
  evidence = acquireExportDestination(evidencePlan);
  stage = "production-identity-bound-command";
  const result = runProductionIdentityBoundCommand({
    environment: "production",
    database: { databaseName, databaseId },
    operation,
    commandArgs: ["d1", "export", databaseName, "--remote", "--no-schema", "--output", "/dev/fd/3"],
    runWrangler: (args) => {
      try { output.verify(); evidence.verify(); return runWrangler(args); }
      catch (error) { throw wrapCanarySubprocessFailure(stage, error); }
    },
  });
  output.verify();
  if (fstatSync(output.fd).size === 0) throw new Error('Missing export bytes.');
  evidence.write(`${JSON.stringify({ verdict: "pass", commit: gitCommit, ...result.observedIdentity, operation }, null, 2)}\n`);
  output.verify();
} catch (error) {
  let reportedError = error;
  let cleanup = 'not-acquired';
  for (const allocation of [evidence, output].filter(Boolean)) {
    try { allocation.clear(); if (cleanup !== 'unverified') cleanup = 'owned-inodes-cleared'; }
    catch (cleanupError) {
      stage = "production-identity-bound-cleanup";
      reportedError = cleanupError;
      cleanup = 'unverified';
    }
  }
  const failure = safeCanaryFailure(stage, reportedError);
  console.error(JSON.stringify({ check: "production-identity-bound-command", verdict: "fail", failedStage: failure.stage, errorCode: failure.code, error: failure.message, cleanup, ...(failure.exitStatus === undefined ? {} : { exitStatus: failure.exitStatus }) }));
  process.exitCode = 1;
} finally {
  for (const allocation of [evidence, output].filter(Boolean)) allocation.close();
}
