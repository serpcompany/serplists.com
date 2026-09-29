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

// A dev server listens on one address: Vite's `localhost` is ::1 or 127.0.0.1 depending on
// the resolver, Wrangler binds 127.0.0.1 on Windows and `localhost` elsewhere, and other
// tools take a wildcard. On Windows a bind to one of these succeeds while another process
// holds the port on a different one, so a port is free only if every one of them binds.
const PORT_PROBE_BINDS = [
  { host: "127.0.0.1" },
  { host: "::1" },
  { host: "0.0.0.0" },
  { host: "::", ipv6Only: false },
];
const PORT_PROBE_CONNECT_HOSTS = ["127.0.0.1", "::1"];
const PORT_PROBE_CONNECT_TIMEOUT_MS = 500;
// The machine lacks that address (IPv6 disabled): the bind says nothing about the port.
const MISSING_ADDRESS_CODES = new Set(["EADDRNOTAVAIL", "EAFNOSUPPORT", "ENETUNREACH", "EPROTONOSUPPORT"]);

// Resolves only after the probe server has closed, so the probe never holds the port itself.
function canBind(port, listenOptions) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(MISSING_ADDRESS_CODES.has(error?.code)));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen({ ...listenOptions, port, exclusive: true });
  });
}

// True when something accepts a connection there. A refusal, a missing address, or no answer
// in time leaves the answer to the binds: on some Windows setups a refused loopback
// connection takes a second or more, and that must not make every port look busy.
function acceptsConnection(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (accepted) => {
      socket.destroy();
      resolve(accepted);
    };
    socket.setTimeout(PORT_PROBE_CONNECT_TIMEOUT_MS, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

/**
 * True when no server holds `port` on any address a dev server may use: nothing accepts a
 * connection on either loopback address, and the port binds on 127.0.0.1, ::1, 0.0.0.0 and
 * the dual-stack wildcard in turn. The dev launchers, the smoke runner and the Stripe
 * listener's predicted target all pick ports with it (findOpenPortPair).
 */
export async function isPortAvailable(port) {
  const accepted = await Promise.all(PORT_PROBE_CONNECT_HOSTS.map((host) => acceptsConnection(port, host)));
  if (accepted.some(Boolean)) return false;
  for (const listenOptions of PORT_PROBE_BINDS) {
    if (!(await canBind(port, listenOptions))) return false;
  }
  return true;
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

const ROLE_COMMANDS = { all: "pnpm run dev:all", frontend: "pnpm run dev", api: "pnpm run dev:api" };

function describeRunningLauncher({ role, pid }, { frontendPort, apiPort }) {
  return `\`${ROLE_COMMANDS[role]}\` (pid ${pid}) is already running on ${frontendPort}/${apiPort}`;
}

/** Why dev:all refused: a single-role launcher owns the session pair. */
export function describeDevSessionConflict({ frontendPort, apiPort, conflict }) {
  const missing = conflict.role === "frontend" ? { role: "api", name: "API" } : { role: "frontend", name: "frontend" };
  return (
    `${describeRunningLauncher(conflict, { frontendPort, apiPort })}. Run \`${ROLE_COMMANDS[missing.role]}\` ` +
    `to add the ${missing.name} to that pair, or \`pnpm run dev:stop\` first and then \`pnpm run dev:all\`.`
  );
}

/**
 * The port pair a launcher should use. It joins the session's pair while a
 * launcher recorded there is still running. dev:all instead returns a
 * `conflict` when only `dev` or only `dev:api` is running: it must not start a
 * second pair and so drop that launcher from the session.
 */
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

  if (session) {
    const [allActive, frontendActive, apiActive] = await Promise.all(
      ROLES.map((role) => processLivenessChecker(session[`${role}Pid`], session[`${role}StartedAt`])),
    );
    const sessionPair = { frontendPort: session.frontendPort, apiPort: session.apiPort, source: "session" };

    if (mode === "all") {
      // `dev` plus `dev:api` on one pair is already the whole stack.
      if (allActive || (frontendActive && apiActive)) {
        return { ...sessionPair, roleAlreadyRunning: true };
      }
      // A new pair would drop the running single-role launcher from the session,
      // and dev:stop could no longer stop it. dev-auto refuses instead.
      if (frontendActive || apiActive) {
        const role = frontendActive ? "frontend" : "api";
        return { ...sessionPair, roleAlreadyRunning: false, conflict: { role, pid: session[`${role}Pid`] } };
      }
    } else if (allActive || frontendActive || apiActive) {
      // A single-role launcher joins any live launcher's pair.
      return { ...sessionPair, roleAlreadyRunning: allActive || (mode === "frontend" ? frontendActive : apiActive) };
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

/**
 * Records this launcher in the session file. It refuses (throws) rather than
 * write a session that forgets a launcher that is still running, because
 * dev:stop stops only the launchers the file lists.
 */
export async function storeDevSession({
  role,
  pid,
  startedAt,
  config,
  sessionPath = DEV_SESSION_PATH,
  processLivenessChecker = isOwnedDevProcess,
}) {
  const existingSession = readDevSession(sessionPath);
  const nextSession = buildDevSession({
    existingSession,
    role,
    pid,
    startedAt,
    config,
  });

  for (const droppedRole of ROLES) {
    const droppedPid = existingSession?.[`${droppedRole}Pid`] ?? null;
    if (droppedPid == null || nextSession[`${droppedRole}Pid`] === droppedPid) continue;

    if (await processLivenessChecker(droppedPid, existingSession[`${droppedRole}StartedAt`])) {
      throw new Error(
        `${describeRunningLauncher({ role: droppedRole, pid: droppedPid }, existingSession)} and is recorded in ` +
          `${sessionPath}. Run \`pnpm run dev:stop\` before starting another port pair.`,
      );
    }
  }

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
