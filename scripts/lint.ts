import { spawnSync } from "node:child_process";

import { lintRuns } from "./lib/lint-runs";
import { buildToolInvocation, REPO_ROOT } from "./lib/run-tool";

const failedRuns = lintRuns(process.argv.slice(2)).filter((eslintArgs) => {
  const { command, args, options } = buildToolInvocation("eslint", eslintArgs);
  return spawnSync(command, args, { ...options, cwd: REPO_ROOT, stdio: "inherit" }).status !== 0;
});

process.exitCode = failedRuns.length > 0 ? 1 : 0;
