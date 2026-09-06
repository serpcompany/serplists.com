#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runDataCommand } from "./data-command-lib.mjs";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { safeCanaryFailure } from "./canary-diagnostics.mjs";
import { writeDataCheckReports } from "./reporting.mjs";

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
const rehearsalRecoveryExport = process.argv[2] === 'rehearsal-recovery-export';
let context = rehearsalRecoveryExport ? { target: { environment: 'unknown', binding: 'unknown', databaseName: 'unknown', databaseId: 'unknown' }, targetIdentitySource: 'unknown', remoteIdentity: null, migrationRange: { from: 'invalid', to: 'invalid' } } : {};
function reportRecoveryExport(report) {
  writeDataCheckReports({ name: 'recovery-export', reportDirectory: path.join(repoRoot, 'tmp/data-reports/rehearsal/recovery'), report,
    summary: `${report.verdict.toUpperCase()} recovery export commit=${report.commit}; target=${JSON.stringify(report.target)}; targetIdentitySource=${report.targetIdentitySource}; remoteIdentity=${JSON.stringify(report.remoteIdentity)}; migration=${JSON.stringify(report.migrationRange)}; stage=${report.failedStage ?? 'data-export'}; ${report.code ?? 'separate-restore-and-comparison-required'}${report.exitStatus === undefined ? '' : `; exitStatus=${report.exitStatus}`}.`,
  });
}
try {
  gitCommit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"], stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  if (!/^[0-9a-f]{40}$/.test(gitCommit)) throw new Error('Invalid commit.');
  const output = [];
  const result = runDataCommand({
    argv: process.argv.slice(2),
    repoRoot,
    gitCommit,
    write: (value) => output.push(value),
    onStage: (value, report) => {
      stage = value;
      if (rehearsalRecoveryExport && value === 'data-identity') context.remoteIdentity = null;
      if (report && !rehearsalRecoveryExport) context = { target: { environment: report.environment, binding: report.binding, databaseName: report.databaseName, databaseId: report.databaseId }, migrationRange: report.migrationRange };
    },
    onReportContext: value => { context = value; },
    onIdentityVerified: value => { context.remoteIdentity = value; },
    runCommand,
  });
  stage = 'data-reporting';
  if (rehearsalRecoveryExport && result.executed) reportRecoveryExport({ verdict: 'pass', commit: gitCommit, ...context, ...JSON.parse(result.output) });
  for (const value of output) process.stdout.write(`${value}\n`);
} catch (error) {
  const failure = safeCanaryFailure(stage, error);
  const report = { verdict: 'fail', commit: /^[0-9a-f]{40}$/.test(gitCommit) ? gitCommit : 'unknown', ...context, failedStage: failure.stage, ...failure };
  if (rehearsalRecoveryExport) {
    try { reportRecoveryExport(report); }
    catch { console.error('Recovery export diagnostics could not be persisted.'); }
  }
  console.error(JSON.stringify(report));
  process.exit(rehearsalRecoveryExport && failure.exitStatus > 0 ? failure.exitStatus : 1);
}
