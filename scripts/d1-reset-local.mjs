import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATABASE_NAME, LOCAL_SEED_STEPS } from "./lib/local-d1-seed.mjs";
import { execTool } from "./lib/run-tool.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const localD1StatePath = path.resolve(
  repoRoot,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const retryableDeleteCodes = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);

if (!localD1StatePath.startsWith(path.join(repoRoot, ".wrangler"))) {
  throw new Error(`Refusing to reset unexpected D1 state path: ${localD1StatePath}`);
}

function run(tool, args) {
  execTool(tool, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function resetLocalD1State() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      rmSync(localD1StatePath, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = error && typeof error === "object" ? error.code : undefined;
      if (!retryableDeleteCodes.has(code) || attempt === 5) {
        throw new Error(
          `Could not reset local D1 state at ${localD1StatePath}. Stop any running Wrangler/Pages dev process and retry.`,
          { cause: error },
        );
      }
      sleep(250 * attempt);
    }
  }
}

try {
  resetLocalD1State();
  run("wrangler", [
    "d1",
    "migrations",
    "apply",
    DATABASE_NAME,
    "--local",
  ]);
  for (const step of LOCAL_SEED_STEPS) run(step.tool, step.args);
  console.log("Local D1 reset complete");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
