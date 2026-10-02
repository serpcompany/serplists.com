import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { firstOf } from "../../support/elements";
import { listeningPort } from "../../support/listeningPort";
import {
  buildCorsAllowedOrigins,
  buildDevServerCommand,
  buildDevServerConfig,
  DEV_FALLBACK_AUTH_SECRET,
  findOpenPort,
  isOwnedDevProcess,
  isPortAvailable,
  isProcessAlive,
  readDevSession,
  releaseDevSession,
  resolveDevServerPort,
  stopDevSession,
  writeDevSession,
} from "../../../scripts/dev-auto-lib.mjs";
import { applyDevBindings, DEV_BINDINGS_VARIABLE, parseDevBindings } from "../../../scripts/lib/dev-bindings.mjs";

describe("buildCorsAllowedOrigins", () => {
  it("adds the dev server's origin and preserves existing allowed origins", () => {
    expect(buildCorsAllowedOrigins("http://localhost:3000,https://tools.example.com", "http://localhost:3001")).toBe(
      "http://localhost:3000,https://tools.example.com,http://localhost:3001",
    );
  });

  it("deduplicates the origin when it is already listed", () => {
    expect(buildCorsAllowedOrigins("http://localhost:3000,http://localhost:3001", "http://localhost:3001")).toBe(
      "http://localhost:3000,http://localhost:3001",
    );
  });
});

describe("buildDevServerConfig", () => {
  it("points the Worker's FRONTEND_URL and CORS origins at the server it starts", () => {
    expect(
      buildDevServerConfig({
        port: 3001,
        baseEnv: { CORS_ALLOWED_ORIGINS: "http://localhost:3000", FRONTEND_URL: "http://localhost:3000" },
      }),
    ).toEqual({
      port: 3001,
      origin: "http://localhost:3001",
      bindings: {
        FRONTEND_URL: "http://localhost:3001",
        CORS_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:3001",
        BETTER_AUTH_SECRET: DEV_FALLBACK_AUTH_SECRET,
      },
    });
  });

  it("passes the configured auth secret, or the legacy one, and falls back only when there is none", () => {
    const secret = (baseEnv: Record<string, string>) => buildDevServerConfig({ port: 3000, baseEnv }).bindings.BETTER_AUTH_SECRET;

    expect(secret({ BETTER_AUTH_SECRET: "configured-secret", JWT_SECRET: "legacy-secret" })).toBe("configured-secret");
    expect(secret({ JWT_SECRET: "legacy-secret" })).toBe("legacy-secret");
    expect(secret({})).toBe(DEV_FALLBACK_AUTH_SECRET);
  });
});

describe("buildDevServerCommand", () => {
  const baseEnv = { BETTER_AUTH_SECRET: 'se cret&"%PATH%^!', NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED: "true" };
  const config = buildDevServerConfig({ port: 3002, baseEnv });

  it("starts next dev with Node and its bin script, not through pnpm or a shell", () => {
    const command = buildDevServerCommand({ config, baseEnv, execPath: "node-bin" });

    expect(command.command).toBe("node-bin");
    expect(command.args[0]).toMatch(/[\\/]next[\\/]dist[\\/]bin[\\/]next$/);
    expect(existsSync(firstOf(command.args))).toBe(true);
    expect(command.args.slice(1)).toEqual(["dev", "--port", "3002"]);
    expect(command.options).toEqual({});
  });

  it("hands next dev .dev.vars and the Worker vars for its port, values unchanged", () => {
    const { env } = buildDevServerCommand({ config, baseEnv, execPath: "node-bin" });

    expect(env).toMatchObject({ NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED: "true", PORT: "3002" });
    expect(parseDevBindings(env[DEV_BINDINGS_VARIABLE])).toEqual({
      FRONTEND_URL: "http://localhost:3002",
      CORS_ALLOWED_ORIGINS: "http://localhost:3002",
      BETTER_AUTH_SECRET: 'se cret&"%PATH%^!',
    });
  });
});

describe("dev bindings in next dev", () => {
  const passed = { [DEV_BINDINGS_VARIABLE]: JSON.stringify({ FRONTEND_URL: "http://localhost:3002" }) };

  it("sets the vars dev:all passed over the Worker's own", () => {
    const context = { env: { FRONTEND_URL: "http://localhost:3000", DB: "d1" } };

    expect(applyDevBindings(passed, () => context)).toBe(true);
    expect(context.env).toEqual({ FRONTEND_URL: "http://localhost:3002", DB: "d1" });
  });

  it("does nothing for plain next dev, or in the process that has no bindings", () => {
    const context = { env: { FRONTEND_URL: "http://localhost:3000" } };

    expect(applyDevBindings({}, () => context)).toBe(false);
    expect(
      applyDevBindings(passed, () => {
        throw new Error("initOpenNextCloudflareForDev has not run here");
      }),
    ).toBe(false);
    expect(context.env.FRONTEND_URL).toBe("http://localhost:3000");
  });

  it("refuses anything but a JSON object of strings", () => {
    expect(parseDevBindings(undefined)).toEqual({});
    expect(() => parseDevBindings("not json")).toThrow();
    expect(() => parseDevBindings(JSON.stringify({ FRONTEND_URL: 3000 }))).toThrow();
    expect(() => parseDevBindings(JSON.stringify(["FRONTEND_URL"]))).toThrow();
  });
});

describe("findOpenPort", () => {
  it("returns the preferred port when it is free", async () => {
    expect(await findOpenPort({ preferredPort: 3000, portAvailabilityChecker: async () => true })).toBe(3000);
  });

  it("moves up until it finds a free port", async () => {
    const busy = new Set([3000, 3001]);

    expect(await findOpenPort({ preferredPort: 3000, portAvailabilityChecker: async (port) => !busy.has(port) })).toBe(3002);
  });

  it("gives up after the search limit", async () => {
    await expect(
      findOpenPort({ preferredPort: 3000, searchLimit: 2, portAvailabilityChecker: async () => false }),
    ).rejects.toThrow("Unable to find an open port from 3000 to 3002.");
  });
});

const PORT_HOLDER_SCRIPT = `
  const server = require("node:net").createServer();
  server.on("error", (error) => { console.log("error:" + error.code); });
  server.listen({ ...JSON.parse(process.argv[1]), port: 0 }, () => console.log("port:" + server.address().port));
  process.stdin.on("end", () => process.exit(0));
  process.stdin.resume();
`;

describe("isPortAvailable with real sockets", { timeout: 20_000 }, () => {
  async function holdPortFromAnotherProcess(listen: Record<string, unknown>) {
    const child = spawn(process.execPath, ["-e", PORT_HOLDER_SCRIPT, JSON.stringify(listen)], { stdio: ["pipe", "pipe", "inherit"] });
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
  ])("calls a port busy while another process listens on %s, though on Windows a bind to another of its addresses succeeds", async (_label, listen) => {
    const holder = await holdPortFromAnotherProcess(listen);
    const thisMachineLacksTheAddress = holder === null;
    if (thisMachineLacksTheAddress) return;
    try {
      expect(await isPortAvailable(holder.port)).toBe(false);
    } finally {
      await holder.release();
    }
  });

  it("calls a port nothing holds free", async () => {
    const port = await new Promise<number>((resolve) => {
      const server = net.createServer().listen({ host: "127.0.0.1", port: 0 }, () => {
        const freePort = listeningPort(server);
        server.close(() => resolve(freePort));
      });
    });

    expect(await isPortAvailable(port)).toBe(true);
  });
});

describe("resolveDevServerPort", () => {
  const session = { port: 3001, pid: 4321, startedAt: 1_000 };

  it("reports the recorded server as running while its launcher runs, so dev:all starts no second one", async () => {
    const isOwned = vi.fn(async () => true);
    const checkPort = vi.fn(async () => true);

    expect(
      await resolveDevServerPort({ existingSession: session, processLivenessChecker: isOwned, portAvailabilityChecker: checkPort }),
    ).toEqual({ port: 3001, running: true, pid: 4321 });
    expect(isOwned).toHaveBeenCalledWith(4321, 1_000);
    expect(checkPort).not.toHaveBeenCalled();
  });

  it("picks a free port when nothing is recorded or the launcher is gone", async () => {
    const busy = async (port: number) => port !== 3000;

    expect(await resolveDevServerPort({ existingSession: null, portAvailabilityChecker: busy })).toEqual({
      port: 3001,
      running: false,
    });
    expect(
      await resolveDevServerPort({
        existingSession: session,
        processLivenessChecker: async () => false,
        portAvailabilityChecker: async () => true,
      }),
    ).toEqual({ port: 3000, running: false });
  });
});

describe("resolveDevServerPort with a reused pid", { timeout: 60_000 }, () => {
  const reusedPid = process.pid;
  const reusedStartedAt = Math.round(Date.now() - process.uptime() * 1000);

  it("starts a new server instead of trusting a session whose pid now runs another program, as this test process does", async () => {
    const actual = await resolveDevServerPort({
      existingSession: { port: 3001, pid: reusedPid, startedAt: reusedStartedAt },
      portAvailabilityChecker: async () => true,
    });

    expect(actual).toEqual({ port: 3000, running: false });
  });

  it("does not trust a session written without a start time", async () => {
    const actual = await resolveDevServerPort({
      existingSession: { port: 3001, pid: reusedPid },
      portAvailabilityChecker: async () => true,
    });

    expect(actual).toEqual({ port: 3000, running: false });
  });
});

describe("the session file", () => {
  const withSessionPath = (test: (sessionPath: string) => void) => {
    const directory = mkdtempSync(path.join(tmpdir(), "dev-session-"));
    try {
      test(path.join(directory, "tmp", "dev-session.json"));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  it("keeps the launcher's port, pid and start time", () => {
    withSessionPath((sessionPath) => {
      writeDevSession({ port: 3001, pid: 1111, startedAt: 1_000 }, sessionPath);

      expect(readDevSession(sessionPath)).toEqual({ port: 3001, pid: 1111, startedAt: 1_000 });
    });
  });

  it("treats a session file from the old port pair as no session", () => {
    withSessionPath((sessionPath) => {
      mkdirSync(path.dirname(sessionPath), { recursive: true });
      writeFileSync(sessionPath, JSON.stringify({ frontendPort: 8080, apiPort: 8788, allPid: 1111, allStartedAt: 1_000 }));

      expect(readDevSession(sessionPath)).toBeNull();
      expect(() => writeDevSession({ frontendPort: 8080, apiPort: 8788 }, sessionPath)).toThrow(
        "Cannot write an invalid dev session.",
      );
    });
  });

  it("is removed by the launcher that wrote it, and only by that one", () => {
    withSessionPath((sessionPath) => {
      writeDevSession({ port: 3001, pid: 1111, startedAt: 1_000 }, sessionPath);

      expect(releaseDevSession({ pid: 2222, sessionPath })).toEqual({ port: 3001, pid: 1111, startedAt: 1_000 });
      expect(existsSync(sessionPath)).toBe(true);
      expect(releaseDevSession({ pid: 1111, sessionPath })).toBeNull();
      expect(existsSync(sessionPath)).toBe(false);
    });
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

  it("treats a process we may not signal (EPERM) as not ours, since the launcher runs as the current user", () => {
    expect(isProcessAlive(1234, failingKill("EPERM"))).toBe(false);
  });
});

describe("isOwnedDevProcess", () => {
  const launcher = { startedAt: 1_000_000, commandLine: "C:\\node\\node.exe scripts/dev-auto.mjs" };
  const alive = () => true;

  it("accepts the recorded dev launcher at a start time the OS reports a little apart, as ps gives whole seconds", async () => {
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

describe("stopDevSession", () => {
  const session = { port: 3001, pid: 1111, startedAt: 1_000 };

  it("kills the recorded launcher's process tree and clears the session", async () => {
    const isOwned = vi.fn(async () => true);
    const killTree = vi.fn();
    const removeSession = vi.fn();

    const result = await stopDevSession({ session, isOwned, killTree, removeSession });

    expect(isOwned).toHaveBeenCalledWith(1111, 1_000);
    expect(killTree).toHaveBeenCalledWith(1111);
    expect(removeSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ stopped: [1111], skipped: [], failed: [] });
  });

  it("skips a pid that is no longer the launcher, and reports a failed kill", async () => {
    const removeSession = vi.fn();

    expect(await stopDevSession({ session, isOwned: async () => false, killTree: vi.fn(), removeSession })).toEqual({
      stopped: [],
      skipped: [1111],
      failed: [],
    });
    expect(
      await stopDevSession({
        session,
        isOwned: async () => true,
        killTree: () => {
          throw new Error("Access is denied.");
        },
        removeSession,
      }),
    ).toEqual({ stopped: [], skipped: [], failed: [{ pid: 1111, message: "Access is denied." }] });
    expect(removeSession).toHaveBeenCalledTimes(2);
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
