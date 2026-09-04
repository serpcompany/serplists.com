#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateGitHubRunEvidence } from "./production-executor-lib.mjs";
function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
try {
  validateGitHubRunEvidence({
    metadata: JSON.parse(readFileSync(arg("--metadata"), "utf8")),
    commit: arg("--commit"),
    workflowName: arg("--workflow"),
    eventName: arg("--event"),
    headBranch: arg("--branch"),
    workflowPath: arg("--path"),
  });
  console.log(`Verified GitHub-produced ${arg("--workflow")} evidence for ${arg("--commit")}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
