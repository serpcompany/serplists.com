#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validatePromotionEvidence, verifySignedEvidence } from "./production-executor-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
try {
  const request = validatePromotionEvidence(JSON.parse(readFileSync(arg("--request"), "utf8")));
  const data = verifySignedEvidence({ signedEvidence: JSON.parse(readFileSync(arg("--evidence"), "utf8")) });
  const smoke = JSON.parse(readFileSync(arg("--smoke"), "utf8"));
  const deploymentUrl = readFileSync(arg("--deployment-url-file"), "utf8").trim();
  if (data.verdict !== "pass" || smoke.verdict !== "pass" || data.commit !== request.commit || !/^https:\/\//.test(deploymentUrl)) {
    throw new Error("Production release evidence is incomplete or failed.");
  }
  const report = {
    check: "production-release",
    verdict: "pass",
    commit: request.commit,
    target: { environment: "production", ...request.database },
    migrationRange: request.migrationRange,
    recovery: data.results,
    approval: data.approval,
    deploymentUrl,
    authenticatedAndCustomDomainSmoke: smoke,
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
