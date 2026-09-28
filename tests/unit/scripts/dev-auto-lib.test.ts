import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildCorsAllowedOrigins,
  buildDevAutoConfig,
  buildDevCommands,
  buildDevSession,
  clearDevSessionRole,
  findOpenPortPair,
  isOwnedDevProcess,
  isProcessAlive,
  readDevSession,
  resolvePortPairForMode,
  stopDevSession,
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
