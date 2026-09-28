// Environment for tests/e2e/run-smoke.mjs, kept apart so unit tests can check it.
// The invariant: the D1 directory the runner wipes and seeds is the one Playwright's
// API server (playwright.config.ts, `--persist-to`) runs on.
import path from "node:path";

export const DEFAULT_SMOKE_FRONTEND_PORT = 4173;
export const DEFAULT_SMOKE_API_PORT = 8788;
export const SMOKE_PERSIST_PATH = path.join(".wrangler", "smoke-state");

const PRESET_STACK_VARIABLES = [
  "PLAYWRIGHT_BASE_URL",
  "PLAYWRIGHT_FRONTEND_PORT",
  "PLAYWRIGHT_API_PORT",
  "PLAYWRIGHT_API_URL",
  "VITE_API_URL",
];

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

const buildLocalUrl = (port) => `http://localhost:${port}`;

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || /^127(\.\d{1,3}){3}$/.test(host);
}

const urlPort = (url) => Number(url.port || (url.protocol === "https:" ? 443 : 80));

/** True when the runner should pick a free port pair: nothing about the stack is preset. */
export function needsOpenPorts(processEnv) {
  return processEnv.PLAYWRIGHT_REUSE_EXISTING_SERVER !== "1" && PRESET_STACK_VARIABLES.every((name) => processEnv[name] == null);
}

/**
 * Resolves a persist path for the smoke D1 and refuses anything the runner must not
 * wipe: it has to sit strictly inside <repo>/.wrangler/ and outside .wrangler/state,
 * which holds the developer's own local D1.
 */
export function assertSmokePersistPath(persistPath, repoRoot) {
  const resolved = path.resolve(repoRoot, persistPath);
  const isInside = (parent) => {
    const relative = path.relative(parent, resolved);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  const devState = path.resolve(repoRoot, ".wrangler", "state");
  if (!isInside(path.resolve(repoRoot, ".wrangler")) || resolved === devState || isInside(devState)) {
    throw new Error(
      `Refusing to reset smoke D1 at ${resolved}: PLAYWRIGHT_WRANGLER_PERSIST_TO must be a folder inside .wrangler/ other than .wrangler/state (your local dev database).`,
    );
  }
  return resolved;
}

/**
 * The env for Playwright and the D1 directory to seed (`seedPath`, null when nothing
 * should be seeded). Whenever the runner seeds, PLAYWRIGHT_WRANGLER_PERSIST_TO is that
 * same path, whichever ports or URLs were preset. `openPorts` is the pair picked when
 * needsOpenPorts() is true.
 */
export function resolveSmokeEnv(processEnv, { openPorts = null, repoRoot }) {
  const env = { ...processEnv };
  const notes = [];
  env.PLAYWRIGHT_REUSE_EXISTING_SERVER ??= "0";

  let apiPort;
  if (openPorts) {
    apiPort = openPorts.apiPort;
    const frontendUrl = buildLocalUrl(openPorts.frontendPort);
    const apiUrl = `${buildLocalUrl(apiPort)}/api`;
    env.PLAYWRIGHT_FRONTEND_PORT = String(openPorts.frontendPort);
    env.PLAYWRIGHT_API_PORT = String(apiPort);
    env.PLAYWRIGHT_BASE_URL = frontendUrl;
    env.PLAYWRIGHT_API_URL = apiUrl;
    env.VITE_API_URL = apiUrl;
    env.FRONTEND_URL ??= frontendUrl;
    notes.push(`Smoke tests using ${frontendUrl} and ${apiUrl}`);
  } else {
    const frontendPort = parsePort(env.PLAYWRIGHT_FRONTEND_PORT, DEFAULT_SMOKE_FRONTEND_PORT);
    apiPort = parsePort(env.PLAYWRIGHT_API_PORT, DEFAULT_SMOKE_API_PORT);
    env.PLAYWRIGHT_BASE_URL ??= buildLocalUrl(frontendPort);
    env.PLAYWRIGHT_API_URL ??= `${buildLocalUrl(apiPort)}/api`;
    env.VITE_API_URL ??= env.PLAYWRIGHT_API_URL;
    env.FRONTEND_URL ??= env.PLAYWRIGHT_BASE_URL;
  }

  if (env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1") {
    notes.push("Reusing the running servers: their D1 is not reset or seeded.");
    return { env, seedPath: null, notes };
  }

  const persistPath = env.PLAYWRIGHT_WRANGLER_PERSIST_TO || SMOKE_PERSIST_PATH;
  assertSmokePersistPath(persistPath, repoRoot);
  env.PLAYWRIGHT_WRANGLER_PERSIST_TO = persistPath;

  const apiUrls = ["PLAYWRIGHT_API_URL", "VITE_API_URL"].map((name) => ({ name, url: parseUrl(env[name]) }));
  const remote = apiUrls.find(({ url }) => url && !isLoopbackHost(url.hostname));
  if (remote) {
    notes.push(`${remote.name} is not local (${env[remote.name]}), so no local D1 is seeded; that stack must already hold the test fixtures.`);
    return { env, seedPath: null, notes };
  }
  const elsewhere = apiUrls.find(({ url }) => url && urlPort(url) !== apiPort);
  if (elsewhere) {
    throw new Error(
      `${elsewhere.name}=${env[elsewhere.name]} does not use port ${apiPort}, where the smoke API server starts on ${persistPath}. Set PLAYWRIGHT_API_PORT to match, or unset ${elsewhere.name}.`,
    );
  }
  return { env, seedPath: persistPath, notes };
}
