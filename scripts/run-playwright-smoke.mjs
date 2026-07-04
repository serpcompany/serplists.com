import { spawn } from "node:child_process";
import { findOpenPortPair } from "./dev-auto-lib.mjs";

const DEFAULT_SMOKE_FRONTEND_PORT = 4173;
const DEFAULT_SMOKE_API_PORT = 8788;

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function buildLocalUrl(port) {
  return `http://localhost:${port}`;
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
