#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateFinalProductionRelease, validatePromotionEvidence } from "./production-executor-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { validateControlledCanaryChecks } from "./deployment-smoke-lib.mjs";
function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
try {
  const request = validatePromotionEvidence(JSON.parse(readFileSync(arg("--request"), "utf8")));
  const signedEvidence = JSON.parse(readFileSync(arg("--evidence"), "utf8"));
  const smoke = JSON.parse(readFileSync(arg("--smoke"), "utf8"));
  validateControlledCanaryChecks(smoke);
  const deploymentUrl = readFileSync(arg("--deployment-url-file"), "utf8").trim();
  const data = validateFinalProductionRelease({ request, signedEvidence, smoke, deploymentUrl });
  const report = {
    check: "production-release",
    verdict: "pass",
    commit: request.commit,
    target: { environment: "production", ...request.database },
    migrationRange: request.migrationRange,
    recovery: data.results,
    approval: data.approval,
    deploymentUrl,
    authenticatedAndCustomDomainSmoke: { verdict: smoke.verdict, checks: smoke.checks, failures: smoke.failures, controlledCanaryMutationApproved: smoke.controlledCanaryMutationApproved, canaryEvidenceDigest: smoke.canaryEvidenceDigest, deploymentUrl: smoke.deploymentUrl, customDomain: smoke.customDomain },
    rollbackRoute: "docs/knowledge/incident-response-runbook.md",
  };
  const summary = `PASS production release ${request.commit} to ${deploymentUrl}; recovery, migration, invariants, authenticated visibility, and custom-domain checks passed.`;
  writeDataCheckReports({ name: "production-release", report, summary, reportDirectory: arg("--report-dir") ?? "tmp/data-reports/production-postdeploy" });
  console.log(summary);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeDataCheckReports({ name: "production-release", report: { check: "production-release", verdict: "fail", commit: process.env.GITHUB_SHA ?? "unknown", error: message }, summary: `BLOCKED production release: ${message}`, reportDirectory: arg("--report-dir") ?? "tmp/data-reports/production-postdeploy" });
  console.error(message);
  process.exitCode = 1;
}
