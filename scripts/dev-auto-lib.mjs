import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import net from "node:net";
import { DEV_BINDINGS_VARIABLE } from "./lib/dev-bindings.mjs";
import { readProcessInfo } from "./lib/process-info.mjs";
import { buildToolInvocation, killPidTree } from "./lib/run-tool.mjs";

// `pnpm run dev:all` runs one Next.js dev server (pages and the API on one origin). It
// prefers Next.js's own default port and moves up when another checkout or program holds it.
export const DEFAULT_DEV_PORT = 3000;
export const PORT_SEARCH_LIMIT = 25;
export const DEV_SESSION_PATH = "tmp/dev-session.json";
// The recorded start time and the one the OS reports differ by clock granularity
// (ps prints whole seconds) and Node's startup time.
export const START_TIME_TOLERANCE_MS = 5_000;
// Used only when neither .dev.vars nor the shell has an auth secret.
export const DEV_FALLBACK_AUTH_SECRET = "local-dev-better-auth-secret-32-chars";
const DEV_LAUNCHER_SCRIPT = /dev-auto\.mjs/;

function normalizePid(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function normalizeStartedAt(value) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

// The launcher pid is stored with its process start time, so a pid the OS has since given
// to another process is never mistaken for the launcher.
function normalizeDevSession(value) {
  if (!value || !Number.isInteger(value.port) || value.port <= 0) {
    return null;
  }

  return {
    port: value.port,
    pid: normalizePid(value.pid),
    startedAt: normalizeStartedAt(value.startedAt),
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

export function buildCorsAllowedOrigins(existingValue, origin) {
  const origins = new Set();

  for (const rawValue of String(existingValue ?? "").split(",")) {
    const trimmed = rawValue.trim();
    if (!trimmed) continue;
    origins.add(trimmed);
  }

  origins.add(origin);

  return Array.from(origins).join(",");
}

/**
 * The dev server on `port`: its origin, and the Worker vars it needs that .dev.vars cannot
 * know (the port is picked at start). The API builds its own links (Stripe returns, invites)
 * from FRONTEND_URL, so it names this server; CORS_ALLOWED_ORIGINS keeps the configured
 * origins and adds it. `baseEnv` is .dev.vars with the shell's variables over it.
 */
export function buildDevServerConfig({ port, baseEnv = {} }) {
  const origin = `http://localhost:${port}`;
  return {
    port,
    origin,
    bindings: {
      FRONTEND_URL: origin,
      CORS_ALLOWED_ORIGINS: buildCorsAllowedOrigins(baseEnv.CORS_ALLOWED_ORIGINS, origin),
      BETTER_AUTH_SECRET: baseEnv.BETTER_AUTH_SECRET || baseEnv.JWT_SECRET || DEV_FALLBACK_AUTH_SECRET,
    },
  };
}

/**
 * How dev-auto starts the server: `next dev` run with the current Node and Next.js's bin
 * script (no npx or pnpm shims, no shell), with .dev.vars and the shell's variables in its
 * environment (Next.js inlines NEXT_PUBLIC_* values from there) and the Worker vars in
 * DEV_BINDINGS_VARIABLE (scripts/lib/dev-bindings.mjs).
 */
export function buildDevServerCommand({ config, baseEnv = {}, execPath = process.execPath }) {
  return {
    ...buildToolInvocation("next", ["dev", "--port", String(config.port)], { execPath }),
    label: "Next.js",
    env: {
      ...baseEnv,
      PORT: String(config.port),
      [DEV_BINDINGS_VARIABLE]: JSON.stringify(config.bindings),
    },
  };
}

// A dev server listens on one address: `localhost` is ::1 or 127.0.0.1 depending on the
// resolver, Wrangler binds 127.0.0.1 on Windows and `localhost` elsewhere, and other tools
// (next dev) take a wildcard. On Windows a bind to one of these succeeds while another
// process holds the port on a different one, so a port is free only if every one of them binds.
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
 * the dual-stack wildcard in turn. The dev launcher, the smoke runner and the Stripe
 * listener's predicted target all pick ports with it (findOpenPort).
 */
export async function isPortAvailable(port) {
  const accepted = await Promise.all(PORT_PROBE_CONNECT_HOSTS.map((host) => acceptsConnection(port, host)));
  if (accepted.some(Boolean)) return false;
  for (const listenOptions of PORT_PROBE_BINDS) {
    if (!(await canBind(port, listenOptions))) return false;
  }
  return true;
}

/** The first free port from `preferredPort` up, trying `searchLimit` more after it. */
export async function findOpenPort({
  preferredPort = DEFAULT_DEV_PORT,
  searchLimit = PORT_SEARCH_LIMIT,
  portAvailabilityChecker = isPortAvailable,
} = {}) {
  for (let offset = 0; offset <= searchLimit; offset += 1) {
    const port = preferredPort + offset;
    if (await portAvailabilityChecker(port)) return port;
  }

  throw new Error(`Unable to find an open port from ${preferredPort} to ${preferredPort + searchLimit}.`);
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

/**
 * Where dev:all should run: on the recorded session's port while the launcher that
 * recorded it still runs (`running`, so dev:all does not start a second server), otherwise
 * on the first free port from `preferredPort`.
 */
export async function resolveDevServerPort({
  existingSession = null,
  preferredPort = DEFAULT_DEV_PORT,
  searchLimit = PORT_SEARCH_LIMIT,
  portAvailabilityChecker = isPortAvailable,
  processLivenessChecker = isOwnedDevProcess,
} = {}) {
  const session = normalizeDevSession(existingSession);
  if (session && (await processLivenessChecker(session.pid, session.startedAt))) {
    return { port: session.port, running: true, pid: session.pid };
  }

  return {
    port: await findOpenPort({ preferredPort, searchLimit, portAvailabilityChecker }),
    running: false,
  };
}

/**
 * Removes the session file when it still records this launcher (`pid`). A session another
 * launcher wrote since is left alone.
 */
export function releaseDevSession({ pid, sessionPath = DEV_SESSION_PATH }) {
  const session = readDevSession(sessionPath);
  if (session && session.pid !== pid) return session;
  removeDevSession(sessionPath);
  return null;
}

/**
 * Stops the launcher a session recorded (dev:stop), with everything it started. Only a pid
 * that still belongs to its dev launcher is killed; a stale or reused pid is skipped. The
 * session file is always removed.
 */
export async function stopDevSession({
  session,
  isOwned = isOwnedDevProcess,
  killTree = killPidTree,
  removeSession = () => removeDevSession(),
}) {
  const result = { stopped: [], skipped: [], failed: [] };

  try {
    const { pid, startedAt } = session;
    if (pid != null) {
      if (!(await isOwned(pid, startedAt))) {
        result.skipped.push(pid);
      } else {
        try {
          killTree(pid);
          result.stopped.push(pid);
        } catch (error) {
          result.failed.push({ pid, message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  } finally {
    removeSession();
  }

  return result;
}
