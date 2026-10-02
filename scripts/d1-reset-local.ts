import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DATABASE_NAME, RESET_SEED_STEPS, seedStepInvocation } from "./lib/local-d1-seed";
import { buildToolInvocation, type Invocation } from "./lib/run-tool";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const localD1StatePath = path.resolve(
  repoRoot,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const retryableDeleteCodes = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);
const errorWithCodeSchema = z.object({ code: z.string() });

if (!localD1StatePath.startsWith(path.join(repoRoot, ".wrangler"))) {
  throw new Error(`Refusing to reset unexpected D1 state path: ${localD1StatePath}`);
}

function run({ command, args, options }: Invocation) {
  execFileSync(command, args, {
    ...options,
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
}

function sleep(milliseconds: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function resetLocalD1State() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      rmSync(localD1StatePath, { recursive: true, force: true });
      return;
    } catch (error) {
      const failure = errorWithCodeSchema.safeParse(error);
      if (!failure.success || !retryableDeleteCodes.has(failure.data.code) || attempt === 5) {
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
  run(buildToolInvocation("wrangler", [
    "d1",
    "migrations",
    "apply",
    DATABASE_NAME,
    "--local",
  ]));
  for (const step of RESET_SEED_STEPS) run(seedStepInvocation(step));
  console.log("Local D1 reset complete");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
