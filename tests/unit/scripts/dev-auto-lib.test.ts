import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCorsAllowedOrigins,
  buildDevAutoConfig,
  buildDevCommands,
  buildDevSession,
  clearDevSessionRole,
  describeDevSessionConflict,
  findOpenPortPair,
  isOwnedDevProcess,
  isPortAvailable,
  isProcessAlive,
  readDevSession,
  resolvePortPairForMode,
  stopDevSession,
  storeDevSession,
  writeDevSession,
} from "../../../scripts/dev-auto-lib.mjs";

describe("buildCorsAllowedOrigins", () => {
  it("adds the chosen frontend URL and preserves existing allowed origins", () => {
    const actual = buildCorsAllowedOrigins(
      "http://localhost:8080,http://localhost:4173",
      "http://localhost:8081",
    );

    expect(actual).toBe(
      "http://localhost:8080,http://localhost:4173,http://localhost:8081",
    );
  });

  it("deduplicates the chosen frontend URL when it already exists", () => {
    const actual = buildCorsAllowedOrigins(
      "http://localhost:8080,http://localhost:8081",
      "http://localhost:8081",
    );

    expect(actual).toBe("http://localhost:8080,http://localhost:8081");
  });
});

describe("buildDevAutoConfig", () => {
  it("builds a matched frontend/api config and env overrides", () => {
    const actual = buildDevAutoConfig({
      frontendPort: 8081,
      apiPort: 8789,
      baseEnv: {
        CORS_ALLOWED_ORIGINS: "http://localhost:8080",
      },
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendUrl: "http://localhost:8081",
      apiUrl: "http://localhost:8789/api",
      betterAuthSecret: "local-dev-better-auth-secret-32-chars",
      corsAllowedOrigins: "http://localhost:8080,http://localhost:8081",
      envOverrides: {
        BETTER_AUTH_SECRET: "local-dev-better-auth-secret-32-chars",
        FRONTEND_URL: "http://localhost:8081",
        CORS_ALLOWED_ORIGINS: "http://localhost:8080,http://localhost:8081",
        PORT: "8081",
        VITE_API_URL: "http://localhost:8789/api",
      },
    });
  });
});

describe("findOpenPortPair", () => {
  it("returns the preferred ports when both are available", async () => {
    const actual = await findOpenPortPair({
      preferredFrontendPort: 8080,
      preferredApiPort: 8788,
      portAvailabilityChecker: async () => true,
    });

    expect(actual).toEqual({
      frontendPort: 8080,
      apiPort: 8788,
    });
  });

  it("moves both ports together until it finds an open pair", async () => {
    const occupiedPorts = new Set([8080, 8788, 8081]);

    const actual = await findOpenPortPair({
      preferredFrontendPort: 8080,
      preferredApiPort: 8788,
      portAvailabilityChecker: async (port) => !occupiedPorts.has(port),
    });

    expect(actual).toEqual({
      frontendPort: 8082,
      apiPort: 8790,
    });
  });
});

// The dev servers listen on one address each (Vite's `localhost` on ::1 or 127.0.0.1,
// Wrangler on 127.0.0.1 on Windows), from another process. On Windows a bind to another
// address of the same port still succeeds, so a probe that binds only the wildcard calls
// such a port free.
describe("isPortAvailable with real sockets", { timeout: 20_000 }, () => {
  const HOLDER = `
    const server = require("node:net").createServer();
    server.on("error", (error) => { console.log("error:" + error.code); });
    server.listen({ ...JSON.parse(process.argv[1]), port: 0 }, () => console.log("port:" + server.address().port));
    process.stdin.on("end", () => process.exit(0));
    process.stdin.resume();
  `;

  // Holds a port on `listen` from another process; null when this machine lacks the address.
  async function holdPort(listen: Record<string, unknown>) {
    const child = spawn(process.execPath, ["-e", HOLDER, JSON.stringify(listen)], { stdio: ["pipe", "pipe", "inherit"] });
    const line = await new Promise<string>((resolve) => {
      child.stdout.once("data", (data) => resolve(String(data).trim()));
      child.once("exit", () => resolve("exited"));
    });
    const release = () => new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      child.kill();
    });
    if (!line.startsWith("port:")) {
      await release();
      return null;
    }
    return { port: Number(line.slice("port:".length)), release };
  }

  it.each([
    ["127.0.0.1", { host: "127.0.0.1" }],
    ["::1", { host: "::1" }],
    ["0.0.0.0", { host: "0.0.0.0" }],
    [":: (dual-stack)", { host: "::", ipv6Only: false }],
  ])("calls a port busy while another process listens on %s", async (_label, listen) => {
    const holder = await holdPort(listen);
    if (!holder) return; // No IPv6 on this machine.
    try {
      expect(await isPortAvailable(holder.port)).toBe(false);
    } finally {
      await holder.release();
    }
  });

  it("calls a port nothing holds free", async () => {
    const port = await new Promise<number>((resolve) => {
      const server = net.createServer().listen({ host: "127.0.0.1", port: 0 }, () => {
        const { port: freePort } = server.address() as net.AddressInfo;
        server.close(() => resolve(freePort));
      });
    });

    expect(await isPortAvailable(port)).toBe(true);
  });
});

describe("resolvePortPairForMode", () => {
  it("marks the requested role as already running when the same single-role launcher owns the active pair", async () => {
    const actual = await resolvePortPairForMode({
      mode: "frontend",
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: 1234,
        apiPid: null,
        allPid: null,
      },
      processLivenessChecker: async (pid) => pid === 1234,
      portAvailabilityChecker: async () => true,
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      source: "session",
      roleAlreadyRunning: true,
    });
  });

  it("reuses the saved pair when the companion API launcher is still active", async () => {
    const actual = await resolvePortPairForMode({
      mode: "frontend",
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: null,
        apiPid: 1234,
        allPid: null,
      },
      processLivenessChecker: async (pid) => pid === 1234,
      portAvailabilityChecker: async () => true,
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      source: "session",
      roleAlreadyRunning: false,
    });
  });

  it("marks the requested role as already running when dev:all owns the active pair", async () => {
    const actual = await resolvePortPairForMode({
      mode: "frontend",
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: null,
        apiPid: null,
        allPid: 3333,
      },
      processLivenessChecker: async (pid) => pid === 3333,
      portAvailabilityChecker: async () => true,
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      source: "session",
      roleAlreadyRunning: true,
    });
  });

  it("finds a new open pair when there is no active companion session", async () => {
    const actual = await resolvePortPairForMode({
      mode: "api",
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: 4321,
        apiPid: null,
        allPid: null,
      },
      processLivenessChecker: async () => false,
      portAvailabilityChecker: async (port) => !new Set([8080, 8788]).has(port),
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      source: "open-pair",
      roleAlreadyRunning: false,
    });
  });
});

describe("dev:all next to a running single-role launcher", () => {
  const roles = ["all", "frontend", "api"] as const;
  type Role = (typeof roles)[number];
  const pidFor: Record<Role, number> = { all: 3333, frontend: 1111, api: 2222 };
  const sessionWith = (live: Role[]) => ({
    frontendPort: 8080,
    apiPort: 8788,
    frontendPid: live.includes("frontend") ? pidFor.frontend : null,
    frontendStartedAt: live.includes("frontend") ? 1_000 : null,
    apiPid: live.includes("api") ? pidFor.api : null,
    apiStartedAt: live.includes("api") ? 2_000 : null,
    allPid: live.includes("all") ? pidFor.all : null,
    allStartedAt: live.includes("all") ? 3_000 : null,
  });
  // A live launcher holds its ports: dev:all and a dead launcher's pid hold none.
  const checkers = (live: Role[]) => {
    const livePids = new Set(live.map((role) => pidFor[role]));
    const busyPorts = new Set<number>();
    if (live.includes("all") || live.includes("frontend")) busyPorts.add(8080);
    if (live.includes("all") || live.includes("api")) busyPorts.add(8788);
    return {
      processLivenessChecker: async (pid: number | null) => pid != null && livePids.has(pid),
      portAvailabilityChecker: async (port: number) => !busyPorts.has(port),
    };
  };

  it("refuses instead of choosing a new pair while `pnpm run dev` owns the session", async () => {
    const actual = await resolvePortPairForMode({ mode: "all", existingSession: sessionWith(["frontend"]), ...checkers(["frontend"]) });

    expect(actual).toEqual({
      frontendPort: 8080,
      apiPort: 8788,
      source: "session",
      roleAlreadyRunning: false,
      conflict: { role: "frontend", pid: 1111 },
    });
  });

  it("refuses instead of choosing a new pair while `pnpm run dev:api` owns the session", async () => {
    const actual = await resolvePortPairForMode({ mode: "all", existingSession: sessionWith(["api"]), ...checkers(["api"]) });

    expect(actual).toMatchObject({ frontendPort: 8080, apiPort: 8788, conflict: { role: "api", pid: 2222 } });
  });

  it("treats `dev` plus `dev:api` on one pair as the full stack already running", async () => {
    const actual = await resolvePortPairForMode({
      mode: "all",
      existingSession: sessionWith(["frontend", "api"]),
      ...checkers(["frontend", "api"]),
    });

    expect(actual).toEqual({ frontendPort: 8080, apiPort: 8788, source: "session", roleAlreadyRunning: true });
  });

  it("still starts a new pair when the recorded single-role launcher is gone", async () => {
    const actual = await resolvePortPairForMode({ mode: "all", existingSession: sessionWith(["frontend"]), ...checkers([]) });

    expect(actual).toEqual({ frontendPort: 8080, apiPort: 8788, source: "open-pair", roleAlreadyRunning: false });
  });

  it("names the running command, its pid and ports, and both ways out", () => {
    const frontend = describeDevSessionConflict({ frontendPort: 8080, apiPort: 8788, conflict: { role: "frontend", pid: 1111 } });
    const api = describeDevSessionConflict({ frontendPort: 8080, apiPort: 8788, conflict: { role: "api", pid: 2222 } });

    expect(frontend).toContain("`pnpm run dev` (pid 1111) is already running on 8080/8788");
    expect(frontend).toContain("`pnpm run dev:api`");
    expect(frontend).toContain("`pnpm run dev:stop`");
    expect(api).toContain("`pnpm run dev:api` (pid 2222) is already running on 8080/8788");
    expect(api).toContain("`pnpm run dev`");
  });

  describe("storeDevSession", () => {
    let directory = "";
    let sessionPath = "";
    beforeEach(() => {
      directory = mkdtempSync(path.join(tmpdir(), "dev-session-"));
      sessionPath = path.join(directory, "tmp", "dev-session.json");
    });
    afterEach(() => rmSync(directory, { recursive: true, force: true }));

    it("refuses to overwrite a session whose launcher is still running", async () => {
      writeDevSession(sessionWith(["frontend"]), sessionPath);

      await expect(
        storeDevSession({
          role: "all",
          pid: 4444,
          startedAt: 4_000,
          config: { frontendPort: 8081, apiPort: 8789 },
          sessionPath,
          processLivenessChecker: checkers(["frontend"]).processLivenessChecker,
        }),
      ).rejects.toThrow(/pnpm run dev` \(pid 1111\)/);
      expect(readDevSession(sessionPath)).toEqual(sessionWith(["frontend"]));
    });

    const combinations: Role[][] = [[], ["all"], ["frontend"], ["api"], ["frontend", "api"], ["all", "frontend"], ["all", "api"], roles.slice()];
    for (const mode of roles) {
      for (const live of combinations) {
        it(`${mode} with live [${live.join(", ")}] never writes a session without a live launcher`, async () => {
          const existingSession = sessionWith(live);
          writeDevSession(existingSession, sessionPath);
          const { processLivenessChecker, portAvailabilityChecker } = checkers(live);

          const selected = await resolvePortPairForMode({ mode, existingSession, processLivenessChecker, portAvailabilityChecker });
          if ("conflict" in selected || selected.roleAlreadyRunning) {
            expect(readDevSession(sessionPath)).toEqual(existingSession);
            return;
          }

          const stored = await storeDevSession({
            role: mode,
            pid: 4444,
            startedAt: 4_000,
            config: { frontendPort: selected.frontendPort, apiPort: selected.apiPort },
            sessionPath,
            processLivenessChecker,
          });
          for (const role of live) expect(stored[`${role}Pid`]).toBe(pidFor[role]);
          expect(stored[`${mode}Pid`]).toBe(4444);
        });
      }
    }
  });
});

describe("buildDevSession", () => {
  it("records the active role pid and start time without dropping the existing companion", () => {
    const actual = buildDevSession({
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: 1111,
        frontendStartedAt: 1_000,
        apiPid: null,
        allPid: null,
      },
      role: "api",
      pid: 2222,
      startedAt: 2_000,
      config: {
        frontendPort: 8081,
        apiPort: 8789,
      },
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: 1111,
      frontendStartedAt: 1_000,
      apiPid: 2222,
      apiStartedAt: 2_000,
      allPid: null,
      allStartedAt: null,
    });
  });

  it("preserves the running all launcher when a single-role launcher attaches to the same pair", () => {
    const actual = buildDevSession({
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: null,
        apiPid: null,
        allPid: 3333,
        allStartedAt: 3_000,
      },
      role: "frontend",
      pid: 1111,
      startedAt: 1_000,
      config: {
        frontendPort: 8081,
        apiPort: 8789,
      },
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: 1111,
      frontendStartedAt: 1_000,
      apiPid: null,
      apiStartedAt: null,
      allPid: 3333,
      allStartedAt: 3_000,
    });
  });

  it("drops stale pids when a new port pair is chosen", () => {
    const actual = buildDevSession({
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: null,
        apiPid: null,
        allPid: 3333,
        allStartedAt: 3_000,
      },
      role: "frontend",
      pid: 1111,
      startedAt: 1_000,
      config: {
        frontendPort: 8082,
        apiPort: 8790,
      },
    });

    expect(actual).toEqual({
      frontendPort: 8082,
      apiPort: 8790,
      frontendPid: 1111,
      frontendStartedAt: 1_000,
      apiPid: null,
      apiStartedAt: null,
      allPid: null,
      allStartedAt: null,
    });
  });
});

describe("clearDevSessionRole", () => {
  it("removes the cleared role pid and start time and keeps the session when another launcher is still active", () => {
    const actual = clearDevSessionRole({
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: 1111,
        frontendStartedAt: 1_000,
        apiPid: 2222,
        apiStartedAt: 2_000,
        allPid: null,
      },
      role: "frontend",
      pid: 1111,
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: null,
      frontendStartedAt: null,
      apiPid: 2222,
      apiStartedAt: 2_000,
      allPid: null,
      allStartedAt: null,
    });
  });

  it("returns null when the cleared role was the last active launcher", () => {
    const actual = clearDevSessionRole({
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: 1111,
        apiPid: null,
        allPid: null,
      },
      role: "frontend",
      pid: 1111,
    });

    expect(actual).toBeNull();
  });

  it("keeps the session when a single-role launcher exits but dev:all is still active", () => {
    const actual = clearDevSessionRole({
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: 1111,
        frontendStartedAt: 1_000,
        apiPid: null,
        allPid: 3333,
        allStartedAt: 3_000,
      },
      role: "frontend",
      pid: 1111,
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: null,
      frontendStartedAt: null,
      apiPid: null,
      apiStartedAt: null,
      allPid: 3333,
      allStartedAt: 3_000,
    });
  });
});

describe("readDevSession and writeDevSession", () => {
  it("keep each launcher's start time", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "dev-session-"));
    const sessionPath = path.join(directory, "tmp", "dev-session.json");
    const session = {
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: 1111,
      frontendStartedAt: 1_000,
      apiPid: 2222,
      apiStartedAt: 2_000,
      allPid: 3333,
      allStartedAt: 3_000,
    };

    try {
      writeDevSession(session, sessionPath);
      expect(readDevSession(sessionPath)).toEqual(session);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("isProcessAlive", () => {
  const failingKill = (code: string) => () => {
    throw Object.assign(new Error(code), { code });
  };

  it("is true only when the process can be signalled", () => {
    expect(isProcessAlive(1234, () => true)).toBe(true);
    expect(isProcessAlive(1234, failingKill("ESRCH"))).toBe(false);
  });

  it("treats a process we may not signal (EPERM) as not ours", () => {
    expect(isProcessAlive(1234, failingKill("EPERM"))).toBe(false);
  });
});

describe("isOwnedDevProcess", () => {
  const launcher = { startedAt: 1_000_000, commandLine: "C:\\node\\node.exe scripts/dev-auto.mjs all" };
  const alive = () => true;

  it("accepts the recorded dev launcher", async () => {
    expect(await isOwnedDevProcess(4321, 1_000_400, { isAlive: alive, readInfo: async () => launcher })).toBe(true);
  });

  it("rejects a reused pid that now runs another program", async () => {
    const readInfo = async () => ({ startedAt: 1_000_000, commandLine: "C:\\Code\\Code.exe --type=utility" });

    expect(await isOwnedDevProcess(4321, 1_000_000, { isAlive: alive, readInfo })).toBe(false);
  });

  it("rejects a dev launcher that started at another time", async () => {
    expect(await isOwnedDevProcess(4321, 1_000_000 + 60_000, { isAlive: alive, readInfo: async () => launcher })).toBe(
      false,
    );
  });

  it("never trusts a session without a recorded start time", async () => {
    const readInfo = vi.fn(async () => launcher);

    expect(await isOwnedDevProcess(4321, null, { isAlive: alive, readInfo })).toBe(false);
    expect(readInfo).not.toHaveBeenCalled();
  });

  it("rejects a dead pid or a process it cannot read", async () => {
    expect(await isOwnedDevProcess(4321, 1_000_000, { isAlive: () => false, readInfo: async () => launcher })).toBe(
      false,
    );
    expect(await isOwnedDevProcess(4321, 1_000_000, { isAlive: alive, readInfo: async () => null })).toBe(false);
    expect(
      await isOwnedDevProcess(4321, 1_000_000, {
        isAlive: alive,
        readInfo: async () => ({ startedAt: 1_000_000, commandLine: null }),
      }),
    ).toBe(false);
  });
});

describe("resolvePortPairForMode with a reused pid", { timeout: 60_000 }, () => {
  // This test process is alive but is not a dev launcher, like a pid the OS reused.
  const reusedPid = process.pid;
  const reusedStartedAt = Math.round(Date.now() - process.uptime() * 1000);

  for (const mode of ["all", "frontend", "api"]) {
    it(`starts a new pair for ${mode} instead of reusing the stale session`, async () => {
      const actual = await resolvePortPairForMode({
        mode,
        existingSession: {
          frontendPort: 8081,
          apiPort: 8789,
          frontendPid: reusedPid,
          frontendStartedAt: reusedStartedAt,
          apiPid: reusedPid,
          apiStartedAt: reusedStartedAt,
          allPid: reusedPid,
          allStartedAt: reusedStartedAt,
        },
        portAvailabilityChecker: async () => true,
      });

      expect(actual).toEqual({ frontendPort: 8080, apiPort: 8788, source: "open-pair", roleAlreadyRunning: false });
    });
  }

  it("does not reuse a session written without start times", async () => {
    const actual = await resolvePortPairForMode({
      mode: "all",
      existingSession: { frontendPort: 8081, apiPort: 8789, frontendPid: null, apiPid: null, allPid: reusedPid },
      portAvailabilityChecker: async () => true,
    });

    expect(actual).toEqual({ frontendPort: 8080, apiPort: 8788, source: "open-pair", roleAlreadyRunning: false });
  });
});

describe("stopDevSession", () => {
  const session = {
    frontendPort: 8081,
    apiPort: 8789,
    allPid: 1111,
    allStartedAt: 1_000,
    frontendPid: 2222,
    frontendStartedAt: 2_000,
    apiPid: 3333,
    apiStartedAt: 3_000,
  };

  it("kills only verified launchers, keeps going after a failed kill, and always clears the session", async () => {
    const isOwned = vi.fn(async (pid: number) => pid !== 1111);
    const killTree = vi.fn((pid: number) => {
      if (pid === 2222) throw new Error("Access is denied.");
    });
    const removeSession = vi.fn();

    const result = await stopDevSession({ session, isOwned, killTree, removeSession });

    expect(isOwned.mock.calls).toEqual([
      [1111, 1_000],
      [2222, 2_000],
      [3333, 3_000],
    ]);
    expect(killTree.mock.calls.map(([pid]) => pid)).toEqual([2222, 3333]);
    expect(removeSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ stopped: [3333], skipped: [1111], failed: [{ pid: 2222, message: "Access is denied." }] });
  });

  it("clears the session even when the ownership check throws", async () => {
    const removeSession = vi.fn();

    await expect(
      stopDevSession({
        session,
        isOwned: async () => {
          throw new Error("boom");
        },
        killTree: vi.fn(),
        removeSession,
      }),
    ).rejects.toThrow("boom");
    expect(removeSession).toHaveBeenCalledTimes(1);
  });
});

describe("buildDevCommands", () => {
  const config = buildDevAutoConfig({
    frontendPort: 8081,
    apiPort: 8789,
    baseEnv: { BETTER_AUTH_SECRET: 'se cret&"%PATH%^!', CORS_ALLOWED_ORIGINS: "http://localhost:4173" },
  });
  const wranglerArgs = [
    "pages",
    "dev",
    "./dist",
    "--local",
    "--port",
    "8789",
    "--env-file",
    ".dev.vars",
    "--show-interactive-dev-session=false",
    "-b",
    "FRONTEND_URL=http://localhost:8081",
    "-b",
    "CORS_ALLOWED_ORIGINS=http://localhost:4173,http://localhost:8081",
    "-b",
    'BETTER_AUTH_SECRET=se cret&"%PATH%^!',
  ];

  for (const platform of ["win32", "linux"]) {
    it(`starts Wrangler with Node for dev:api on ${platform}, not through npx`, () => {
      const command = buildDevCommands({ mode: "api", config, hasDevVars: true, platform, execPath: "node-bin" });

      expect(command.command).toBe("node-bin");
      expect(command.args[0]).toMatch(/[\\/]wrangler[\\/]bin[\\/]wrangler\.js$/);
      expect(command.args.slice(1)).toEqual(wranglerArgs);
    });

    it(`starts Vite with Node for dev on ${platform}, not through pnpm`, () => {
      const command = buildDevCommands({ mode: "frontend", config, hasDevVars: true, platform, execPath: "node-bin" });

      expect(command.command).toBe("node-bin");
      expect(command.args[0]).toMatch(/[\\/]vite[\\/]bin[\\/]vite\.js$/);
      expect(command.args.slice(1)).toEqual(["--host", "localhost", "--port", "8081", "--strictPort"]);
    });

    it(`starts concurrently with Node for dev:all on ${platform}, with quoted command lines`, () => {
      const command = buildDevCommands({ mode: "all", config, hasDevVars: false, platform, execPath: "node-bin" });

      expect(command.command).toBe("node-bin");
      expect(command.args[0]).toMatch(/[\\/]concurrently[\\/]dist[\\/]bin[\\/]concurrently\.js$/);
      expect(command.args.slice(1, 6)).toEqual(["--kill-others-on-fail", "--names", "web,api", "--prefix-colors", "cyan,magenta"]);
      const [frontendLine, apiLine] = command.args.slice(6);
      expect(command.args).toHaveLength(8);
      expect(frontendLine).toMatch(/^node-bin .*vite\.js/);
      expect(apiLine).toMatch(/^node-bin .*wrangler\.js/);
      expect(apiLine).not.toContain(".dev.vars");
      expect(apiLine).toContain(
        platform === "win32"
          ? '^"BETTER_AUTH_SECRET=se^ cret^&\\^"^%PATH^%^^^!^"'
          : "'BETTER_AUTH_SECRET=se cret&\"%PATH%^!'",
      );
    });
  }
});
