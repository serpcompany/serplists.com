import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOpenPort } from "../../scripts/dev-auto-lib";
import { buildScriptInvocation, buildToolInvocation, type Invocation, spawnTool } from "../../scripts/lib/run-tool";
import {
  assertSmokePersistPath,
  DEFAULT_E2E_PORT,
  describeBuiltSiteEnv,
  E2E_SITE_ENV,
  needsOpenPort,
  resolveSmokeEnv,
} from "./run-smoke-lib";

const DATABASE_NAME = "serp-checklists-db";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function run({ command, args, options }: Invocation, env: Record<string, string> = {}) {
  execFileSync(command, args, {
    ...options,
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    stdio: "inherit",
  });
}

function resetAndSeedSmokeD1(smokePersistPath: string) {
  rmSync(assertSmokePersistPath(smokePersistPath, repoRoot), { recursive: true, force: true });
  run(
    buildToolInvocation("wrangler", [
      "d1",
      "migrations",
      "apply",
      DATABASE_NAME,
      "--local",
      "--persist-to",
      smokePersistPath,
    ]),
    { CI: "1" },
  );
  run(
    buildScriptInvocation("scripts/data/local-d1-data.ts", [
      "seed-test",
      "--persist-to",
      smokePersistPath,
    ]),
    { CI: "1" },
  );
}

function assertProductionBuild() {
  const headersPath = path.join(repoRoot, ".open-next", "assets", "_headers");
  const builtFor = describeBuiltSiteEnv(existsSync(headersPath) ? readFileSync(headersPath, "utf8") : null);
  if (builtFor !== E2E_SITE_ENV) {
    console.error(
      `The build in .open-next is ${builtFor ?? "missing"}, and the browser tests run the ${E2E_SITE_ENV} build. ` +
        "Build it with SITE_ENV=production (`SITE_ENV=production pnpm run build:worker`), or run without --skip-build.",
    );
    process.exit(1);
  }
}

const RUNNER_FLAGS = new Set(["--all", "--skip-build"]);
const smokeTestsOnly = !process.argv.includes("--all");
const skipBuild = process.argv.includes("--skip-build");
const playwrightArgs = process.argv.slice(2).filter((arg) => !RUNNER_FLAGS.has(arg));

const openPort = needsOpenPort(process.env) ? await findOpenPort({ preferredPort: DEFAULT_E2E_PORT }) : null;
const { env, seedPath, notes } = resolveSmokeEnv(process.env, { openPort, repoRoot });
notes.forEach((note) => console.log(note));

if (seedPath) {
  if (!skipBuild) run(buildToolInvocation("opennextjs-cloudflare", ["build"]), { SITE_ENV: E2E_SITE_ENV });
  assertProductionBuild();
  resetAndSeedSmokeD1(seedPath);
}

const child = spawnTool(
  "playwright",
  ["test", ...(smokeTestsOnly ? ["--grep", "@smoke"] : []), ...playwrightArgs],
  {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Browser tests stopped by ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
