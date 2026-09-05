import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { validateApprovalEvidence } from "./production-executor-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { approvalToken } from "./production-preparation-lib.mjs";
import { safeCanaryFailure } from "./canary-diagnostics.mjs";
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
try {
  const provenance = JSON.parse(readFileSync(arg("--provenance"), "utf8"));
  const recovery = JSON.parse(readFileSync(arg("--recovery-receipt"), "utf8"));
  const recoveryReceiptToken = approvalToken(recovery);
  const reviews = JSON.parse(readFileSync(arg("--reviews"), "utf8")).filter(review => String(review.comment ?? "").includes(recoveryReceiptToken));
  if (reviews.some(review => String(review.state).toLowerCase() === "rejected")) throw new Error("Exact recovery request approval was denied.");
  const ownerPermission = arg("--owner-permission") && existsSync(arg("--owner-permission"))
    ? JSON.parse(readFileSync(arg("--owner-permission"), "utf8"))
    : null;
  const approval = validateApprovalEvidence({
    reviews,
    classification: process.env.REQUEST_CLASSIFICATION,
    actor: process.env.GITHUB_ACTOR,
    changeAuthors: provenance.changeAuthors,
    repositoryOwnerApprover: process.env.REPOSITORY_OWNER_APPROVER,
    ownerPermission,
    recoveryToken: recoveryReceiptToken,
    reviewContext: {
      repository: process.env.GITHUB_REPOSITORY,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      commit: process.env.GITHUB_SHA,
    },
  });
  approval.recovery = recovery;
  writeFileSync(arg("--output"), JSON.stringify(approval, null, 2) + "\n");
} catch (error) {
  const failure = safeCanaryFailure("production-approval-input", error);
  const message = failure.message;
  const report = {
    check: "production-approval",
    verdict: "fail",
    commit: process.env.GITHUB_SHA ?? "unknown",
    target: { environment: "production" },
    classification: process.env.REQUEST_CLASSIFICATION ?? null,
    error: message,
    failedStage: failure.stage,
    errorCode: failure.code,
    checks: [{ name: failure.check, verdict: "fail" }],
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
