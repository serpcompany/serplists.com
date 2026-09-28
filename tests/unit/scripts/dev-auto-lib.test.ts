import { describe, expect, it } from "vitest";
import {
  buildCorsAllowedOrigins,
  buildDevAutoConfig,
  buildDevCommands,
  buildDevSession,
  clearDevSessionRole,
  findOpenPortPair,
  resolvePortPairForMode,
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
  it("records the active role pid without dropping the existing companion pid", () => {
    const actual = buildDevSession({
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: 1111,
        apiPid: null,
        allPid: null,
      },
      role: "api",
      pid: 2222,
      config: {
        frontendPort: 8081,
        apiPort: 8789,
      },
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: 1111,
      apiPid: 2222,
      allPid: null,
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
      },
      role: "frontend",
      pid: 1111,
      config: {
        frontendPort: 8081,
        apiPort: 8789,
      },
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: 1111,
      apiPid: null,
      allPid: 3333,
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
      },
      role: "frontend",
      pid: 1111,
      config: {
        frontendPort: 8082,
        apiPort: 8790,
      },
    });

    expect(actual).toEqual({
      frontendPort: 8082,
      apiPort: 8790,
      frontendPid: 1111,
      apiPid: null,
      allPid: null,
    });
  });
});

describe("clearDevSessionRole", () => {
  it("removes the cleared role pid and keeps the session when another launcher is still active", () => {
    const actual = clearDevSessionRole({
      existingSession: {
        frontendPort: 8081,
        apiPort: 8789,
        frontendPid: 1111,
        apiPid: 2222,
        allPid: null,
      },
      role: "frontend",
      pid: 1111,
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: null,
      apiPid: 2222,
      allPid: null,
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
        apiPid: null,
        allPid: 3333,
      },
      role: "frontend",
      pid: 1111,
    });

    expect(actual).toEqual({
      frontendPort: 8081,
      apiPort: 8789,
      frontendPid: null,
      apiPid: null,
      allPid: 3333,
    });
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
