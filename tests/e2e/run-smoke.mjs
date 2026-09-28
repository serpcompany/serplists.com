import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOpenPortPair } from "../../scripts/dev-auto-lib.mjs";
import { execTool, spawnTool } from "../../scripts/lib/run-tool.mjs";
import {
  assertSmokePersistPath,
  DEFAULT_SMOKE_API_PORT,
  DEFAULT_SMOKE_FRONTEND_PORT,
  needsOpenPorts,
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

// Wipes, migrates and seeds the D1 that Playwright's API server runs on
// (PLAYWRIGHT_WRANGLER_PERSIST_TO, set by resolveSmokeEnv to this same path).
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

const openPorts = needsOpenPorts(process.env)
  ? await findOpenPortPair({
    preferredFrontendPort: DEFAULT_SMOKE_FRONTEND_PORT,
    preferredApiPort: DEFAULT_SMOKE_API_PORT,
  })
  : null;
const { env, seedPath, notes } = resolveSmokeEnv(process.env, { openPorts, repoRoot });
notes.forEach((note) => console.log(note));

if (seedPath) {
  prepareSmokeD1(seedPath);
}

// `--all` runs the full e2e suite through the same isolated local stack.
const runAll = process.argv.includes("--all");
const playwrightArgs = process.argv.slice(2).filter((arg) => arg !== "--all");

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
    console.error(`Smoke tests stopped by ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 1);
});
