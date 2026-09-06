import { parseExactJson } from "./strict-json-lib.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { verifyRecoveryBundle, approvalToken } from "./production-preparation-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { safeCanaryFailure } from './canary-diagnostics.mjs';
import { loadEnvironmentInventory } from './environment-identity-lib.mjs';
import { fileURLToPath } from 'node:url';
const arg = name => process.argv[process.argv.indexOf(name) + 1];
const json = name => parseExactJson(readFileSync(arg(name), "utf8"));
try {
  const receipt = verifyRecoveryBundle({ request: json("--request"), preparation: json("--preparation"), encrypted: readFileSync(arg("--encrypted-export")), expectedDigest: arg("--preparation-digest"), artifactId: arg("--artifact-id"), context: { repository: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, commit: process.env.GITHUB_SHA } });
  writeFileSync(arg("--output"), JSON.stringify(receipt) + "\n");
  const request = json("--request");
  writeDataCheckReports({ name: "durable-recovery-verification", reportDirectory: "tmp/recovery-verification", report: { verdict: "pass", commit: request.commit, target: { environment: "production", ...request.database }, migrationRange: request.migrationRange, receipt, checks: [{ name: approvalToken(receipt), verdict: "pass" }] }, summary: `PASS durable recovery ${approvalToken(receipt)}; request SHA256 ${receipt.requestSha256}.` });
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `Recovery uploaded and downloaded with verified digests. Independent production reviewer must include this exact token in the approval decision: \`${approvalToken(receipt)}\`. Request SHA256: ${receipt.requestSha256}.\n`, { flag: "a" });
} catch (error) {
  const failure = safeCanaryFailure('production-configuration', error);
  const database = loadEnvironmentInventory({ repoRoot: fileURLToPath(new URL('../..', import.meta.url)) }).environments.production;
  const commit = /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : 'unknown';
  const summary = `BLOCKED durable production recovery verification: ${failure.message} Commit ${commit}; production DB ${database.databaseName} (${database.databaseId}).`;
  try { writeDataCheckReports({ name: "durable-recovery-verification", reportDirectory: "tmp/recovery-verification", report: { verdict: "fail", commit, target: { environment: "production", binding: 'DB', databaseName: database.databaseName, databaseId: database.databaseId }, failure }, summary }); }
  catch { console.error('Protected recovery failure report could not be written.'); }
  console.error(summary);
  process.exitCode = 1;
}
