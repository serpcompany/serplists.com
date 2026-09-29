// The browser tests' local stack, kept apart so unit tests can check it: the OpenNext build
// of the app served by `opennextjs-cloudflare preview` (workerd), with the pages and the API
// on one origin. The invariant: the D1 directory tests/e2e/run-smoke.mjs wipes and seeds is
// the one the preview runs on (`--persist-to`).
import path from "node:path";
import { buildCorsAllowedOrigins } from "../../scripts/dev-auto-lib.mjs";

export const DEFAULT_E2E_PORT = 4173;
export const SMOKE_PERSIST_PATH = ".wrangler/smoke-state";
// The auth secret the preview runs with unless the shell sets one.
export const E2E_AUTH_SECRET = "playwright-local-better-auth-secret-32-chars";

const PRESET_STACK_VARIABLES = ["PLAYWRIGHT_BASE_URL", "PLAYWRIGHT_PORT", "PLAYWRIGHT_API_URL"];

// `opennextjs-cloudflare preview` hands its arguments to `wrangler dev` through a shell
// (cmd.exe on Windows) without quoting them, so each one must mean the same to every shell.
const SHELL_SAFE_ARG = /^[\w@+=:,./\\-]+$/;

/** The app's URL (pages and API): PLAYWRIGHT_BASE_URL, else localhost on PLAYWRIGHT_PORT or 4173. */
export function resolveAppUrl(env) {
  return env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${env.PLAYWRIGHT_PORT ?? DEFAULT_E2E_PORT}`;
}

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

/** True when the runner should pick a free port: nothing about the stack is preset. */
export function needsOpenPort(processEnv) {
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
  if (!SHELL_SAFE_ARG.test(persistPath)) {
    throw new Error(
      `PLAYWRIGHT_WRANGLER_PERSIST_TO=${persistPath} reaches wrangler through a shell: use a path of letters, digits, and . / \\ _ - only.`,
    );
  }
  return resolved;
}

/**
 * The env for Playwright and the D1 directory to seed (`seedPath`, null when nothing
 * should be seeded). Whenever the runner seeds, PLAYWRIGHT_WRANGLER_PERSIST_TO is that
 * same path, whichever port or URL was preset. `openPort` is the port picked when
 * needsOpenPort() is true.
 */
export function resolveSmokeEnv(processEnv, { openPort = null, repoRoot }) {
  const env = { ...processEnv };
  const notes = [];
  env.PLAYWRIGHT_REUSE_EXISTING_SERVER ??= "0";

  if (openPort) {
    env.PLAYWRIGHT_BASE_URL = `http://localhost:${openPort}`;
    env.PLAYWRIGHT_API_URL = `${env.PLAYWRIGHT_BASE_URL}/api`;
  } else {
    env.PLAYWRIGHT_BASE_URL = resolveAppUrl(env);
    env.PLAYWRIGHT_API_URL ??= `${env.PLAYWRIGHT_BASE_URL.replace(/\/$/, "")}/api`;
  }
  notes.push(`Browser tests using ${env.PLAYWRIGHT_BASE_URL} (API at ${env.PLAYWRIGHT_API_URL})`);

  const appUrl = parseUrl(env.PLAYWRIGHT_BASE_URL);
  const apiUrl = parseUrl(env.PLAYWRIGHT_API_URL);
  if (!appUrl || !apiUrl || apiUrl.origin !== appUrl.origin) {
    throw new Error(
      `PLAYWRIGHT_API_URL=${env.PLAYWRIGHT_API_URL} is not on the app's origin (${env.PLAYWRIGHT_BASE_URL}): the pages and the API share one origin. Unset PLAYWRIGHT_API_URL.`,
    );
  }

  if (env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1") {
    notes.push("Reusing the running server: its D1 is not reset or seeded.");
    return { env, seedPath: null, notes };
  }

  if (!isLoopbackHost(appUrl.hostname)) {
    notes.push(`PLAYWRIGHT_BASE_URL is not local (${env.PLAYWRIGHT_BASE_URL}), so no local D1 is seeded; that stack must already hold the test fixtures.`);
    return { env, seedPath: null, notes };
  }

  const persistPath = env.PLAYWRIGHT_WRANGLER_PERSIST_TO || SMOKE_PERSIST_PATH;
  assertSmokePersistPath(persistPath, repoRoot);
  env.PLAYWRIGHT_WRANGLER_PERSIST_TO = persistPath;
  return { env, seedPath: persistPath, notes };
}

/**
 * The `opennextjs-cloudflare` arguments that serve the build for the browser tests
 * (tests/e2e/preview-server.mjs): on the app URL's port, on the smoke D1 when
 * PLAYWRIGHT_WRANGLER_PERSIST_TO names one, and with the Worker vars that name the app's
 * origin (--var overrides .dev.vars). Throws on a value a shell would change.
 */
export function buildPreviewArgs(env) {
  const appUrl = new URL(resolveAppUrl(env));
  const port = appUrl.port || (appUrl.protocol === "https:" ? "443" : "80");
  const vars = {
    FRONTEND_URL: appUrl.origin,
    CORS_ALLOWED_ORIGINS: buildCorsAllowedOrigins(env.CORS_ALLOWED_ORIGINS, appUrl.origin),
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET || env.JWT_SECRET || E2E_AUTH_SECRET,
  };

  for (const [name, value] of Object.entries({ ...vars, PLAYWRIGHT_WRANGLER_PERSIST_TO: env.PLAYWRIGHT_WRANGLER_PERSIST_TO ?? "" })) {
    if (value && !SHELL_SAFE_ARG.test(value)) {
      // The value can be a secret: name it, never print it.
      throw new Error(`${name} reaches wrangler through a shell and holds characters it would change. Use letters, digits and - _ . : , / \\ only.`);
    }
  }

  return [
    "preview",
    "--port",
    port,
    "--show-interactive-dev-session=false",
    ...(env.PLAYWRIGHT_WRANGLER_PERSIST_TO ? ["--persist-to", env.PLAYWRIGHT_WRANGLER_PERSIST_TO] : []),
    ...Object.entries(vars).flatMap(([name, value]) => ["--var", `${name}:${value}`]),
  ];
}
