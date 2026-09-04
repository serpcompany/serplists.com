import { readFileSync, writeFileSync } from "node:fs";
import { validateApprovalEvidence } from "./production-executor-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
try {
  const approval = validateApprovalEvidence({ reviews: JSON.parse(readFileSync(arg("--reviews"), "utf8")), classification: process.env.REQUEST_CLASSIFICATION, actor: process.env.GITHUB_ACTOR, decision: process.env.REQUEST_APPROVAL_DECISION, environment: "production", repositoryOwnerApprover: process.env.REPOSITORY_OWNER_APPROVER });
  writeFileSync(arg("--output"), JSON.stringify(approval, null, 2) + "\n");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const report = {
    check: "production-approval",
    verdict: "fail",
    commit: process.env.GITHUB_SHA ?? "unknown",
    target: { environment: "production" },
    classification: process.env.REQUEST_CLASSIFICATION ?? null,
    error: message,
  };
  writeDataCheckReports({
    name: "production-approval",
    report,
    summary: `BLOCKED production approval: ${message}`,
    reportDirectory: "tmp/data-reports/production",
  });
  console.error(message);
  process.exitCode = 1;
}
