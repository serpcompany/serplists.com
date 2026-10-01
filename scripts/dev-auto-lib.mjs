import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import net from "node:net";
import { z } from "zod";
import { DEV_BINDINGS_VARIABLE } from "./lib/dev-bindings.mjs";
import { readProcessInfo } from "./lib/process-info.mjs";
import { buildToolInvocation, killPidTree } from "./lib/run-tool.mjs";

export const DEFAULT_DEV_PORT = 3000;
export const PORT_SEARCH_LIMIT = 25;
export const DEV_SESSION_PATH = "tmp/dev-session.json";
export const START_TIME_TOLERANCE_MS = 5_000;
export const DEV_FALLBACK_AUTH_SECRET = "local-dev-better-auth-secret-32-chars";
const DEV_LAUNCHER_SCRIPT = /dev-auto\.mjs/;

const pidSchema = z.number().int().positive();
const startedAtSchema = z.number().finite().positive();
const devSessionSchema = z.object({
  port: z.number().int().positive(),
  pid: pidSchema.nullable().catch(null),
  startedAt: startedAtSchema.nullable().catch(null),
});

function normalizeDevSession(value) {
  const session = devSessionSchema.safeParse(value);
  return session.success ? session.data : null;
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

const PORT_PROBE_BINDS = [
  { host: "127.0.0.1" },
  { host: "::1" },
  { host: "0.0.0.0" },
  { host: "::", ipv6Only: false },
];
const PORT_PROBE_CONNECT_HOSTS = ["127.0.0.1", "::1"];
const PORT_PROBE_CONNECT_TIMEOUT_MS = 500;
const ADDRESS_THIS_MACHINE_LACKS_CODES = new Set(["EADDRNOTAVAIL", "EAFNOSUPPORT", "ENETUNREACH", "EPROTONOSUPPORT"]);

function bindsAndClosesAgain(port, listenOptions) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => resolve(ADDRESS_THIS_MACHINE_LACKS_CODES.has(error?.code)));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen({ ...listenOptions, port, exclusive: true });
  });
}

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

export async function isPortAvailable(port) {
  const accepted = await Promise.all(PORT_PROBE_CONNECT_HOSTS.map((host) => acceptsConnection(port, host)));
  if (accepted.some(Boolean)) return false;
  for (const listenOptions of PORT_PROBE_BINDS) {
    if (!(await bindsAndClosesAgain(port, listenOptions))) return false;
  }
  return true;
}

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

export async function isOwnedDevProcess(pid, startedAt, { isAlive = isProcessAlive, readInfo = readProcessInfo } = {}) {
  if (!pidSchema.safeParse(pid).success || !startedAtSchema.safeParse(startedAt).success || !isAlive(pid)) {
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
    return normalizeDevSession(JSON.parse(readFileSync(sessionPath, "utf8")));
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

export function releaseDevSession({ pid, sessionPath = DEV_SESSION_PATH }) {
  const session = readDevSession(sessionPath);
  if (session && session.pid !== pid) return session;
  removeDevSession(sessionPath);
  return null;
}

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
