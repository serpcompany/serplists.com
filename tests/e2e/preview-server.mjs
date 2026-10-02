import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BROWSER_TEST_LOG_PATH, mirrorOutputToLog } from "../../scripts/lib/log-mirror.mjs";
import { describeSpawnError, killProcessTree, spawnTool } from "../../scripts/lib/run-tool.mjs";
import { buildPreviewArgs } from "./run-smoke-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function killPreviewProcessTreeOnStop(preview) {
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => killProcessTree(preview, signal));
  }
}

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
killPreviewProcessTreeOnStop(child);

child.on("error", (error) => {
  console.error(describeSpawnError(error, "opennextjs-cloudflare preview"));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
