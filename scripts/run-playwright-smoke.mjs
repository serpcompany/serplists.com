import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOpenPortPair } from "./dev-auto-lib.mjs";

const DEFAULT_SMOKE_FRONTEND_PORT = 4173;
const DEFAULT_SMOKE_API_PORT = 8788;
const DATABASE_NAME = "serp-checklists-db";
const NPX_COMMAND = process.platform === "win32" ? "cmd.exe" : "npx";
const NPX_ARGS_PREFIX = process.platform === "win32" ? ["/d", "/s", "/c", "npx"] : [];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const smokePersistPath = path.join(".wrangler", "smoke-state");
const smokePersistAbsolutePath = path.resolve(repoRoot, smokePersistPath);

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function buildLocalUrl(port) {
  return `http://localhost:${port}`;
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: "inherit",
  });
}

function prepareSmokeD1() {
  const wranglerStateRoot = path.resolve(repoRoot, ".wrangler");

  if (!smokePersistAbsolutePath.startsWith(wranglerStateRoot)) {
    throw new Error(`Refusing to reset unexpected smoke D1 path: ${smokePersistAbsolutePath}`);
  }

  rmSync(smokePersistAbsolutePath, { recursive: true, force: true });
  run(
    NPX_COMMAND,
    [
      ...NPX_ARGS_PREFIX,
      "wrangler",
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
    "pnpm",
    [
      "exec",
      "tsx",
      "scripts/data/local-d1-data.ts",
      "seed-test",
      "--persist-to",
      smokePersistPath,
    ],
    { env: { CI: "1" } },
  );
}

const env = { ...process.env };

env.PLAYWRIGHT_REUSE_EXISTING_SERVER ??= "0";

const shouldPickOpenPorts =
  env.PLAYWRIGHT_REUSE_EXISTING_SERVER !== "1" &&
  env.PLAYWRIGHT_BASE_URL == null &&
  env.PLAYWRIGHT_FRONTEND_PORT == null &&
  env.PLAYWRIGHT_API_PORT == null &&
  env.PLAYWRIGHT_API_URL == null &&
  env.VITE_API_URL == null;

if (shouldPickOpenPorts) {
  const { frontendPort, apiPort } = await findOpenPortPair({
    preferredFrontendPort: DEFAULT_SMOKE_FRONTEND_PORT,
    preferredApiPort: DEFAULT_SMOKE_API_PORT,
  });

  const frontendUrl = buildLocalUrl(frontendPort);
  const apiUrl = `${buildLocalUrl(apiPort)}/api`;

  env.PLAYWRIGHT_FRONTEND_PORT = String(frontendPort);
  env.PLAYWRIGHT_API_PORT = String(apiPort);
  env.PLAYWRIGHT_BASE_URL = frontendUrl;
  env.PLAYWRIGHT_API_URL = apiUrl;
  env.PLAYWRIGHT_WRANGLER_PERSIST_TO = smokePersistPath;
  env.VITE_API_URL = apiUrl;
  env.FRONTEND_URL ??= frontendUrl;

  console.log(`Smoke tests using ${frontendUrl} and ${apiUrl}`);
} else {
  const frontendPort = parsePort(
    env.PLAYWRIGHT_FRONTEND_PORT,
    DEFAULT_SMOKE_FRONTEND_PORT,
  );
  const apiPort = parsePort(env.PLAYWRIGHT_API_PORT, DEFAULT_SMOKE_API_PORT);

  env.PLAYWRIGHT_BASE_URL ??= buildLocalUrl(frontendPort);
  env.PLAYWRIGHT_API_URL ??= `${buildLocalUrl(apiPort)}/api`;
  env.VITE_API_URL ??= env.PLAYWRIGHT_API_URL;
  env.FRONTEND_URL ??= env.PLAYWRIGHT_BASE_URL;
}

if (env.PLAYWRIGHT_REUSE_EXISTING_SERVER !== "1") {
  prepareSmokeD1();
}

const pnpmBin = "pnpm";
const child = spawn(
  pnpmBin,
  ["exec", "playwright", "test", "--grep", "@smoke", ...process.argv.slice(2)],
  {
    env,
    shell: process.platform === "win32",
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
