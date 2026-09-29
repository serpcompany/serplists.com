// Runs the browser tests on an isolated local stack: builds the app with OpenNext, wipes,
// migrates and seeds a D1 of its own, and starts Playwright, whose web server serves that
// build with `opennextjs-cloudflare preview` on a free port (tests/e2e/preview-server.mjs).
//   pnpm run test:smoke                  # the @smoke tests
//   pnpm run test:e2e:full               # every test, one worker
//   ... -- --skip-build                  # reuse a production build in .open-next (see below)
// The tests run the production configuration (E2E_SITE_ENV): the runner builds with
// SITE_ENV=production and the preview gets the same var. A build it reuses must be one too:
// `SITE_ENV=production pnpm run build:worker`, as CI builds it.
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOpenPort } from "../../scripts/dev-auto-lib.mjs";
import { execTool, spawnTool } from "../../scripts/lib/run-tool.mjs";
import {
  assertSmokePersistPath,
  DEFAULT_E2E_PORT,
  describeBuiltSiteEnv,
  E2E_SITE_ENV,
  needsOpenPort,
  resolveSmokeEnv,
} from "./run-smoke-lib.mjs";

const DATABASE_NAME = "serp-checklists-db";
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function run(tool, args, options = {}) {
  execTool(tool, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: "inherit",
  });
}

// Wipes, migrates and seeds the D1 that the preview runs on (PLAYWRIGHT_WRANGLER_PERSIST_TO,
// set by resolveSmokeEnv to this same path).
function prepareSmokeD1(smokePersistPath) {
  rmSync(assertSmokePersistPath(smokePersistPath, repoRoot), { recursive: true, force: true });
  run(
    "wrangler",
    [
      "d1",
      "migrations",
      "apply",
      DATABASE_NAME,
      "--local",
      "--persist-to",
      smokePersistPath,
    ],
    {
      env: {
        CI: "1",
      },
    },
  );
  run(
    "tsx",
    [
      "scripts/data/local-d1-data.ts",
      "seed-test",
      "--persist-to",
      smokePersistPath,
    ],
    { env: { CI: "1" } },
  );
}

// SITE_ENV decides headers, redirects and static pages at build time, so the preview's var
// alone cannot make a staging build production.
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
// `--all` runs the full e2e suite through the same isolated local stack.
const runAll = process.argv.includes("--all");
const skipBuild = process.argv.includes("--skip-build");
const playwrightArgs = process.argv.slice(2).filter((arg) => !RUNNER_FLAGS.has(arg));

const openPort = needsOpenPort(process.env) ? await findOpenPort({ preferredPort: DEFAULT_E2E_PORT }) : null;
const { env, seedPath, notes } = resolveSmokeEnv(process.env, { openPort, repoRoot });
notes.forEach((note) => console.log(note));

if (seedPath) {
  // The build bundles the pages and the API, so an older one would test older code.
  if (!skipBuild) run("opennextjs-cloudflare", ["build"], { env: { SITE_ENV: E2E_SITE_ENV } });
  assertProductionBuild();
  prepareSmokeD1(seedPath);
}

const child = spawnTool(
  "playwright",
  ["test", ...(runAll ? [] : ["--grep", "@smoke"]), ...playwrightArgs],
  {
    cwd: repoRoot,
    env,
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
