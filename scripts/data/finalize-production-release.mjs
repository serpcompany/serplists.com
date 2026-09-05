#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateFinalProductionRelease, validatePromotionEvidence } from "./production-executor-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { validateControlledCanaryChecks } from "./deployment-smoke-lib.mjs";
import { validateReportIdentity, reportIdentitySummary } from './report-identity-lib.mjs';
import { safeCanaryFailure } from './canary-diagnostics.mjs';
function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
let identitySnapshot = { commit: 'unknown', target: { environment: 'production', binding: 'unknown', databaseName: 'unknown', databaseId: 'unknown' }, migrationRange: { from: 'invalid', to: 'invalid' } };
try {
  const input = JSON.parse(readFileSync(arg("--request"), "utf8"));
  const identity = validateReportIdentity({ commit: input?.commit, target: { environment: 'production', binding: 'DB', databaseName: input?.database?.databaseName, databaseId: input?.database?.databaseId }, migrationRange: input?.migrationRange });
  identitySnapshot = identity;
  const request = validatePromotionEvidence(input);
  const signedEvidence = JSON.parse(readFileSync(arg("--evidence"), "utf8"));
  const smoke = JSON.parse(readFileSync(arg("--smoke"), "utf8"));
  const deploy = JSON.parse(readFileSync(arg('--deploy'), 'utf8'));
  validateReportIdentity(deploy, identity);
  validateReportIdentity(smoke, identity);
  if (deploy.verdict !== 'pass' || deploy.tree !== request.mergeContext?.tree) throw new Error('Production deployment evidence did not pass for the reviewed tree.');
  validateControlledCanaryChecks(smoke);
  const deploymentUrl = readFileSync(arg("--deployment-url-file"), "utf8").trim();
  const data = validateFinalProductionRelease({ request, signedEvidence, smoke, deploymentUrl });
  const report = {
    check: "production-release",
    verdict: "pass",
    commit: request.commit,
    target: identity.target,
    migrationRange: request.migrationRange,
    recovery: data.results,
    approval: data.approval,
    deploymentUrl,
    authenticatedAndCustomDomainSmoke: { verdict: smoke.verdict, checks: smoke.checks, failures: smoke.failures, controlledCanaryMutationApproved: smoke.controlledCanaryMutationApproved, canaryEvidenceDigest: smoke.canaryEvidenceDigest, deploymentUrl: smoke.deploymentUrl, customDomain: smoke.customDomain },
  };
  const summary = `PASS production release; ${reportIdentitySummary(report)}; deployment ${deploymentUrl}; recovery, migration, invariants, authenticated visibility, and custom-domain checks passed.`;
  writeDataCheckReports({ name: "production-release", report, summary, reportDirectory: arg("--report-dir") ?? "tmp/data-reports/production-postdeploy" });
  console.log(summary);
} catch (error) {
  const failure = safeCanaryFailure('production-configuration', error);
  const message = failure.message;
  const report = { check: 'production-release', verdict: 'fail', ...identitySnapshot, error: message, failure };
  writeDataCheckReports({ name: "production-release", report, summary: `BLOCKED production release; ${reportIdentitySummary(report)}: ${message}`, reportDirectory: arg("--report-dir") ?? "tmp/data-reports/production-postdeploy" });
  console.error(message);
  process.exitCode = 1;
}
