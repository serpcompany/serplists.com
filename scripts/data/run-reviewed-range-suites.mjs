#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { resolveCiRehearsalPlans } from "./rehearsal-plan-lib.mjs";

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const commit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim();
const baseRef = process.env.DATA_REGRESSION_BASE_SHA;
if (!baseRef) throw new Error("CI range evidence requires its trusted comparison base.");
const plans = resolveCiRehearsalPlans({ repoRoot, commit, baseRef });
for (const plan of plans) {
  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["run", "test:data:integration", "--", "--base-ref", baseRef, "--migration-from", plan.migrationRange.from ?? "none", "--migration-to", plan.migrationRange.to ?? "none", "--report-dir", `tmp/data-reports/ci/${plan.id}`], { cwd: repoRoot, env: sanitizedGitEnvironment(), stdio: "inherit" });
}
