#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runDataCommand } from "./data-command-lib.mjs";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { safeCanaryFailure } from "./canary-diagnostics.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function runCommand(command) {
  return execFileSync(command[0], command.slice(1), {
    cwd: repoRoot,
    env: sanitizedGitEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

let stage = 'data-configuration';
let gitCommit = 'unknown';
let context = {};
try {
  gitCommit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"], stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!/^[0-9a-f]{40}$/.test(gitCommit)) throw new Error('Invalid commit.');
  const output = [];
  runDataCommand({
    argv: process.argv.slice(2),
    repoRoot,
    gitCommit,
    write: (value) => output.push(value),
    onStage: (value, report) => {
      stage = value;
      if (report) context = { target: { environment: report.environment, binding: report.binding, databaseName: report.databaseName, databaseId: report.databaseId }, migrationRange: report.migrationRange };
    },
    runCommand,
  });
  stage = 'data-reporting';
  for (const value of output) process.stdout.write(`${value}\n`);
} catch (error) {
  const failure = safeCanaryFailure(stage, error);
  console.error(JSON.stringify({ verdict: 'fail', commit: /^[0-9a-f]{40}$/.test(gitCommit) ? gitCommit : 'unknown', ...context, failedStage: failure.stage, ...failure }));
  process.exit(1);
}
