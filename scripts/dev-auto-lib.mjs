import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import net from "node:net";
import { readProcessInfo } from "./lib/process-info.mjs";
import { buildShellCommandLine, buildToolInvocation, killPidTree } from "./lib/run-tool.mjs";

export const DEFAULT_FRONTEND_PORT = 8080;
export const DEFAULT_API_PORT = 8788;
export const PORT_SEARCH_LIMIT = 25;
export const DEV_SESSION_PATH = "tmp/dev-session.json";
// The recorded start time and the one the OS reports differ by clock granularity
// (ps prints whole seconds) and Node's startup time.
export const START_TIME_TOLERANCE_MS = 5_000;
const DEV_LAUNCHER_SCRIPT = /dev-auto\.mjs/;
const ROLES = ["all", "frontend", "api"];

function normalizePid(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeStartedAt(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizeDevSession(value) {
  if (
    !value ||
    !Number.isInteger(value.frontendPort) ||
    !Number.isInteger(value.apiPort)
  ) {
    return null;
  }

  // Each launcher pid is stored with its process start time, so a pid the OS has
  // since given to another process is never mistaken for the launcher.
  return {
    frontendPort: value.frontendPort,
    apiPort: value.apiPort,
    frontendPid: normalizePid(value.frontendPid),
    frontendStartedAt: normalizeStartedAt(value.frontendStartedAt),
    apiPid: normalizePid(value.apiPid),
    apiStartedAt: normalizeStartedAt(value.apiStartedAt),
    allPid: normalizePid(value.allPid),
    allStartedAt: normalizeStartedAt(value.allStartedAt),
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

// EPERM means the pid belongs to another user or an elevated process. The dev
// launcher always runs as the current user, so that process is not ours.
export function isProcessAlive(pid, kill = (target, signal) => process.kill(target, signal)) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * True only when `pid` is still the dev launcher that recorded it: the process
 * runs scripts/dev-auto.mjs and started at `startedAt`. A session written
 * without a start time is never trusted. Never throws.
 */
export async function isOwnedDevProcess(pid, startedAt, { isAlive = isProcessAlive, readInfo = readProcessInfo } = {}) {
  if (normalizePid(pid) == null || normalizeStartedAt(startedAt) == null || !isAlive(pid)) {
    return false;
  }

  const info = await readInfo(pid);
  return (
    info != null &&
    typeof info.commandLine === "string" &&
    DEV_LAUNCHER_SCRIPT.test(info.commandLine) &&
    Math.abs(info.startedAt - startedAt) <= START_TIME_TOLERANCE_MS
  );
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
  processLivenessChecker = isOwnedDevProcess,
} = {}) {
  const session = normalizeDevSession(existingSession);

  if (session && mode === "all") {
    const allActive = await processLivenessChecker(session.allPid, session.allStartedAt);

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
      processLivenessChecker(session.apiPid, session.apiStartedAt),
      processLivenessChecker(session.allPid, session.allStartedAt),
      processLivenessChecker(session.frontendPid, session.frontendStartedAt),
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
  startedAt = null,
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
  };

  // Companion launchers on the same pair keep their pid and start time; dev:all
  // replaces the single-role launchers.
  for (const sessionRole of ROLES) {
    const keep = reusingExistingPair && (role !== "all" || sessionRole === "all");
    nextSession[`${sessionRole}Pid`] = keep ? previousSession[`${sessionRole}Pid`] : null;
    nextSession[`${sessionRole}StartedAt`] = keep ? previousSession[`${sessionRole}StartedAt`] : null;
  }

  if (ROLES.includes(role)) {
    nextSession[`${role}Pid`] = pid;
    nextSession[`${role}StartedAt`] = normalizeStartedAt(startedAt);
  }

  return normalizeDevSession(nextSession);
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

  if (ROLES.includes(role) && (pid == null || nextSession[`${role}Pid`] === pid)) {
    nextSession[`${role}Pid`] = null;
    nextSession[`${role}StartedAt`] = null;
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
  startedAt,
  config,
  sessionPath = DEV_SESSION_PATH,
}) {
  const nextSession = buildDevSession({
    existingSession: readDevSession(sessionPath),
    role,
    pid,
    startedAt,
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

/**
 * Stops the launchers a session recorded (dev:stop). Only a pid that still
 * belongs to its dev launcher is killed; a stale or reused pid is skipped. A
 * failed kill does not stop the others, and the session file is always removed.
 */
export async function stopDevSession({
  session,
  isOwned = isOwnedDevProcess,
  killTree = killPidTree,
  removeSession = () => removeDevSession(),
}) {
  const result = { stopped: [], skipped: [], failed: [] };

  try {
    for (const role of ROLES) {
      const pid = session[`${role}Pid`];
      if (pid == null) continue;

      if (!(await isOwned(pid, session[`${role}StartedAt`]))) {
        result.skipped.push(pid);
        continue;
      }

      try {
        killTree(pid);
        result.stopped.push(pid);
      } catch (error) {
        result.failed.push({ pid, message: error instanceof Error ? error.message : String(error) });
      }
    }
  } finally {
    removeSession();
  }

  return result;
}
