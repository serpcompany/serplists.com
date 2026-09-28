import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import net from "node:net";
import { buildShellCommandLine, buildToolInvocation } from "./lib/run-tool.mjs";

export const DEFAULT_FRONTEND_PORT = 8080;
export const DEFAULT_API_PORT = 8788;
export const PORT_SEARCH_LIMIT = 25;
export const DEV_SESSION_PATH = "tmp/dev-session.json";

function normalizePid(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeDevSession(value) {
  if (
    !value ||
    !Number.isInteger(value.frontendPort) ||
    !Number.isInteger(value.apiPort)
  ) {
    return null;
  }

  return {
    frontendPort: value.frontendPort,
    apiPort: value.apiPort,
    frontendPid: normalizePid(value.frontendPid),
    apiPid: normalizePid(value.apiPid),
    allPid: normalizePid(value.allPid),
  };
}

export function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  const contents = readFileSync(filePath, "utf8");
  const entries = {};

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    entries[key] = value;
  }

  return entries;
}

export function buildCorsAllowedOrigins(existingValue, frontendUrl) {
  const origins = new Set();

  for (const rawValue of String(existingValue ?? "").split(",")) {
    const trimmed = rawValue.trim();
    if (!trimmed) continue;
    origins.add(trimmed);
  }

  origins.add(frontendUrl);

  return Array.from(origins).join(",");
}

export function buildDevAutoConfig({
  frontendPort,
  apiPort,
  baseEnv = {},
}) {
  const frontendUrl = `http://localhost:${frontendPort}`;
  const apiUrl = `http://localhost:${apiPort}/api`;
  const corsAllowedOrigins = buildCorsAllowedOrigins(
    baseEnv.CORS_ALLOWED_ORIGINS,
    frontendUrl,
  );
  const betterAuthSecret =
    baseEnv.BETTER_AUTH_SECRET ||
    baseEnv.JWT_SECRET ||
    "local-dev-better-auth-secret-32-chars";

  return {
    frontendPort,
    apiPort,
    frontendUrl,
    apiUrl,
    betterAuthSecret,
    corsAllowedOrigins,
    envOverrides: {
      BETTER_AUTH_SECRET: betterAuthSecret,
      FRONTEND_URL: frontendUrl,
      CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
      PORT: String(frontendPort),
      VITE_API_URL: apiUrl,
    },
  };
}

/**
 * The process dev-auto starts for a mode. Tools run as `node <bin script>` (no
 * npx or pnpm shims, no shell), so Windows needs no .cmd resolution and values
 * such as the auth secret reach Wrangler literally. dev:all hands concurrently
 * one command line per server, quoted for the shell concurrently uses.
 */
export function buildDevCommands({
  mode,
  config,
  hasDevVars = false,
  platform = process.platform,
  execPath = process.execPath,
}) {
  const vite = buildToolInvocation(
    "vite",
    ["--host", "localhost", "--port", String(config.frontendPort), "--strictPort"],
    { execPath },
  );
  const wrangler = buildToolInvocation(
    "wrangler",
    [
      "pages",
      "dev",
      "./dist",
      "--local",
      "--port",
      String(config.apiPort),
      ...(hasDevVars ? ["--env-file", ".dev.vars"] : []),
      "--show-interactive-dev-session=false",
      "-b",
      `FRONTEND_URL=${config.frontendUrl}`,
      "-b",
      `CORS_ALLOWED_ORIGINS=${config.corsAllowedOrigins}`,
      "-b",
      `BETTER_AUTH_SECRET=${config.betterAuthSecret}`,
    ],
    { execPath },
  );

  if (mode === "frontend") return { ...vite, label: "Vite" };
  if (mode === "api") return { ...wrangler, label: "Wrangler" };

  return {
    ...buildToolInvocation(
      "concurrently",
      [
        "--kill-others-on-fail",
        "--names",
        "web,api",
        "--prefix-colors",
        "cyan,magenta",
        buildShellCommandLine(vite, platform),
        buildShellCommandLine(wrangler, platform),
      ],
      { execPath },
    ),
    label: "concurrently",
  };
}

export async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen({
      host: "::",
      port,
      exclusive: true,
      ipv6Only: false,
    });
  });
}

export function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export async function findOpenPortPair({
  preferredFrontendPort = DEFAULT_FRONTEND_PORT,
  preferredApiPort = DEFAULT_API_PORT,
  searchLimit = PORT_SEARCH_LIMIT,
  portAvailabilityChecker = isPortAvailable,
} = {}) {
  for (let offset = 0; offset <= searchLimit; offset += 1) {
    const frontendPort = preferredFrontendPort + offset;
    const apiPort = preferredApiPort + offset;

    const [frontendAvailable, apiAvailable] = await Promise.all([
      portAvailabilityChecker(frontendPort),
      portAvailabilityChecker(apiPort),
    ]);

    if (frontendAvailable && apiAvailable) {
      return { frontendPort, apiPort };
    }
  }

  throw new Error(
    `Unable to find an open frontend/API port pair starting at ${preferredFrontendPort}/${preferredApiPort}.`,
  );
}

export function readDevSession(sessionPath = DEV_SESSION_PATH) {
  if (!existsSync(sessionPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(sessionPath, "utf8"));
    return normalizeDevSession(parsed);
  } catch {
    return null;
  }
}

export function writeDevSession(session, sessionPath = DEV_SESSION_PATH) {
  const nextSession = normalizeDevSession(session);
  if (!nextSession) {
    throw new Error("Cannot write an invalid dev session.");
  }

  mkdirSync(path.dirname(sessionPath), { recursive: true });
  writeFileSync(sessionPath, `${JSON.stringify(nextSession, null, 2)}\n`, "utf8");
}

export function removeDevSession(sessionPath = DEV_SESSION_PATH) {
  if (existsSync(sessionPath)) {
    unlinkSync(sessionPath);
  }
}

export async function resolvePortPairForMode({
  mode,
  existingSession = null,
  preferredFrontendPort = DEFAULT_FRONTEND_PORT,
  preferredApiPort = DEFAULT_API_PORT,
  searchLimit = PORT_SEARCH_LIMIT,
  portAvailabilityChecker = isPortAvailable,
  processLivenessChecker = isProcessAlive,
} = {}) {
  const session = normalizeDevSession(existingSession);

  if (session && mode === "all") {
    const allActive = await processLivenessChecker(session.allPid);

    if (allActive) {
      return {
        frontendPort: session.frontendPort,
        apiPort: session.apiPort,
        source: "session",
        roleAlreadyRunning: true,
      };
    }
  }

  if (session && mode !== "all") {
    const [apiActive, allActive, frontendActive] = await Promise.all([
      processLivenessChecker(session.apiPid),
      processLivenessChecker(session.allPid),
      processLivenessChecker(session.frontendPid),
    ]);

    const shouldReuse =
      mode === "frontend"
        ? frontendActive || apiActive || allActive
        : apiActive || frontendActive || allActive;

    if (shouldReuse) {
      const roleAlreadyRunning =
        mode === "frontend" ? frontendActive || allActive : apiActive || allActive;

      return {
        frontendPort: session.frontendPort,
        apiPort: session.apiPort,
        source: "session",
        roleAlreadyRunning,
      };
    }
  }

  const openPair = await findOpenPortPair({
    preferredFrontendPort,
    preferredApiPort,
    searchLimit,
    portAvailabilityChecker,
  });

  return {
    ...openPair,
    source: "open-pair",
    roleAlreadyRunning: false,
  };
}

export function buildDevSession({
  existingSession = null,
  role,
  pid,
  config,
}) {
  const previousSession = normalizeDevSession(existingSession);
  const reusingExistingPair =
    previousSession != null &&
    previousSession.frontendPort === config.frontendPort &&
    previousSession.apiPort === config.apiPort;
  const nextSession = {
    frontendPort: config.frontendPort,
    apiPort: config.apiPort,
    frontendPid: reusingExistingPair ? previousSession.frontendPid : null,
    apiPid: reusingExistingPair ? previousSession.apiPid : null,
    allPid: reusingExistingPair ? previousSession.allPid : null,
  };

  if (role === "all") {
    nextSession.frontendPid = null;
    nextSession.apiPid = null;
    nextSession.allPid = pid;
    return nextSession;
  }

  if (role === "frontend") {
    nextSession.frontendPid = pid;
  }

  if (role === "api") {
    nextSession.apiPid = pid;
  }

  return nextSession;
}

export function clearDevSessionRole({
  existingSession,
  role,
  pid,
}) {
  const session = normalizeDevSession(existingSession);
  if (!session) {
    return null;
  }

  const nextSession = { ...session };

  if (role === "all") {
    if (pid == null || nextSession.allPid === pid) {
      nextSession.allPid = null;
    }
  }

  if (role === "frontend") {
    if (pid == null || nextSession.frontendPid === pid) {
      nextSession.frontendPid = null;
    }
  }

  if (role === "api") {
    if (pid == null || nextSession.apiPid === pid) {
      nextSession.apiPid = null;
    }
  }

  if (
    nextSession.frontendPid == null &&
    nextSession.apiPid == null &&
    nextSession.allPid == null
  ) {
    return null;
  }

  return nextSession;
}

export function storeDevSession({
  role,
  pid,
  config,
  sessionPath = DEV_SESSION_PATH,
}) {
  const nextSession = buildDevSession({
    existingSession: readDevSession(sessionPath),
    role,
    pid,
    config,
  });
  writeDevSession(nextSession, sessionPath);
  return nextSession;
}

export function releaseDevSession({
  role,
  pid,
  sessionPath = DEV_SESSION_PATH,
}) {
  const nextSession = clearDevSessionRole({
    existingSession: readDevSession(sessionPath),
    role,
    pid,
  });

  if (nextSession) {
    writeDevSession(nextSession, sessionPath);
    return nextSession;
  }

  removeDevSession(sessionPath);
  return null;
}
