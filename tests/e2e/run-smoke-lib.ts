import path from "node:path";
import { buildCorsAllowedOrigins } from "../../scripts/dev-auto-lib";

export const DEFAULT_E2E_PORT = 4173;
export const SMOKE_PERSIST_PATH = ".wrangler/smoke-state";
export const E2E_AUTH_SECRET = "playwright-local-better-auth-secret-32-chars";
export const E2E_SITE_ENV = "production";

type Env = Record<string, string | undefined>;

const PRESET_STACK_VARIABLES = ["PLAYWRIGHT_BASE_URL", "PLAYWRIGHT_PORT", "PLAYWRIGHT_API_URL"];

const SAME_IN_EVERY_SHELL = /^[\w@+=:,./\\-]+$/;

export function resolveAppUrl(env: Env): string {
  return env["PLAYWRIGHT_BASE_URL"] ?? `http://localhost:${env["PLAYWRIGHT_PORT"] ?? DEFAULT_E2E_PORT}`;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || /^127(\.\d{1,3}){3}$/.test(host);
}

export function needsOpenPort(processEnv: Env): boolean {
  return processEnv["PLAYWRIGHT_REUSE_EXISTING_SERVER"] !== "1" && PRESET_STACK_VARIABLES.every((name) => processEnv[name] == null);
}

export function assertSmokePersistPath(persistPath: string, repoRoot: string): string {
  const resolved = path.resolve(repoRoot, persistPath);
  const isInside = (parent: string) => {
    const relative = path.relative(parent, resolved);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  };
  const devState = path.resolve(repoRoot, ".wrangler", "state");
  if (!isInside(path.resolve(repoRoot, ".wrangler")) || resolved === devState || isInside(devState)) {
    throw new Error(
      `Refusing to reset smoke D1 at ${resolved}: PLAYWRIGHT_WRANGLER_PERSIST_TO must be a folder inside .wrangler/ other than .wrangler/state (your local dev database).`,
    );
  }
  if (!SAME_IN_EVERY_SHELL.test(persistPath)) {
    throw new Error(
      `PLAYWRIGHT_WRANGLER_PERSIST_TO=${persistPath} reaches wrangler through a shell: use a path of letters, digits, and . / \\ _ - only.`,
    );
  }
  return resolved;
}

export function resolveSmokeEnv(
  processEnv: Env,
  { openPort = null, repoRoot }: { openPort?: number | null; repoRoot: string },
): { env: Env; seedPath: string | null; notes: string[] } {
  const env: Env = { ...processEnv };
  const notes: string[] = [];
  env["PLAYWRIGHT_REUSE_EXISTING_SERVER"] ??= "0";

  let baseUrl: string;
  let apiUrlText: string;
  if (openPort) {
    baseUrl = `http://localhost:${openPort}`;
    apiUrlText = `${baseUrl}/api`;
  } else {
    baseUrl = resolveAppUrl(env);
    apiUrlText = env["PLAYWRIGHT_API_URL"] ?? `${baseUrl.replace(/\/$/, "")}/api`;
  }
  env["PLAYWRIGHT_BASE_URL"] = baseUrl;
  env["PLAYWRIGHT_API_URL"] = apiUrlText;
  notes.push(`Browser tests using ${baseUrl} (API at ${apiUrlText})`);

  const appUrl = parseUrl(baseUrl);
  const apiUrl = parseUrl(apiUrlText);
  if (!appUrl || !apiUrl || apiUrl.origin !== appUrl.origin) {
    throw new Error(
      `PLAYWRIGHT_API_URL=${apiUrlText} is not on the app's origin (${baseUrl}): the pages and the API share one origin. Unset PLAYWRIGHT_API_URL.`,
    );
  }

  if (env["PLAYWRIGHT_REUSE_EXISTING_SERVER"] === "1") {
    notes.push("Reusing the running server: its D1 is not reset or seeded.");
    return { env, seedPath: null, notes };
  }

  if (!isLoopbackHost(appUrl.hostname)) {
    notes.push(`PLAYWRIGHT_BASE_URL is not local (${baseUrl}), so no local D1 is seeded; that stack must already hold the test fixtures.`);
    return { env, seedPath: null, notes };
  }

  const persistPath = env["PLAYWRIGHT_WRANGLER_PERSIST_TO"] || SMOKE_PERSIST_PATH;
  assertSmokePersistPath(persistPath, repoRoot);
  env["PLAYWRIGHT_WRANGLER_PERSIST_TO"] = persistPath;
  return { env, seedPath: persistPath, notes };
}

export function buildPreviewArgs(env: Env): string[] {
  const appUrl = new URL(resolveAppUrl(env));
  const port = appUrl.port || (appUrl.protocol === "https:" ? "443" : "80");
  const vars = {
    FRONTEND_URL: appUrl.origin,
    CORS_ALLOWED_ORIGINS: buildCorsAllowedOrigins(env["CORS_ALLOWED_ORIGINS"], appUrl.origin),
    BETTER_AUTH_SECRET: env["BETTER_AUTH_SECRET"] || env["JWT_SECRET"] || E2E_AUTH_SECRET,
    SITE_ENV: E2E_SITE_ENV,
  };
  const persistTo = env["PLAYWRIGHT_WRANGLER_PERSIST_TO"];

  for (const [name, value] of Object.entries({ ...vars, PLAYWRIGHT_WRANGLER_PERSIST_TO: persistTo ?? "" })) {
    if (value && !SAME_IN_EVERY_SHELL.test(value)) {
      throw new Error(`${name} reaches wrangler through a shell and holds characters it would change. Use letters, digits and - _ . : , / \\ only.`);
    }
  }

  return [
    "preview",
    "--port",
    port,
    "--show-interactive-dev-session=false",
    ...(persistTo ? ["--persist-to", persistTo] : []),
    ...Object.entries(vars).flatMap(([name, value]) => ["--var", `${name}:${value}`]),
  ];
}

export function describeBuiltSiteEnv(staticHeaders: string | null | undefined): "production" | "non-production" | null {
  if (staticHeaders == null) return null;
  return /^\s*X-Robots-Tag:\s*noindex/im.test(staticHeaders) ? "non-production" : "production";
}
