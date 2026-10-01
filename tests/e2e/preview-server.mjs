// Playwright's web server (playwright.config.ts): the OpenNext build of the app in workerd,
// through `opennextjs-cloudflare preview`, on the port and D1 that tests/e2e/run-smoke.mjs
// chose (see buildPreviewArgs). It serves the build as it is: run-smoke builds it first, and
// `pnpm run build:worker` builds it for a direct `playwright test`.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BROWSER_TEST_LOG_PATH, mirrorOutputToLog } from "../../scripts/lib/log-mirror.mjs";
import { describeSpawnError, killProcessTree, spawnTool } from "../../scripts/lib/run-tool.mjs";
import { buildPreviewArgs } from "./run-smoke-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

if (!existsSync(path.join(repoRoot, ".open-next", "worker.js"))) {
  console.error("No OpenNext build in .open-next/. Run `pnpm run build:worker` (pnpm run test:smoke builds it itself).");
  process.exit(1);
}

const child = spawnTool("opennextjs-cloudflare", buildPreviewArgs(process.env), {
  cwd: repoRoot,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});
mirrorOutputToLog(child, path.join(repoRoot, BROWSER_TEST_LOG_PATH));

// Playwright stops this process when the tests end; on Windows the preview's workerd would
// otherwise keep the port.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => killProcessTree(child, signal));
}

child.on("error", (error) => {
  console.error(describeSpawnError(error, "opennextjs-cloudflare preview"));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
