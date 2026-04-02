import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  buildDevAutoConfig,
  DEFAULT_API_PORT,
  DEFAULT_FRONTEND_PORT,
  DEV_SESSION_PATH,
  parseEnvFile,
  readDevSession,
  releaseDevSession,
  resolvePortPairForMode,
  storeDevSession,
} from "./dev-auto-lib.mjs";

const DIST_INDEX_PATH = "dist/index.html";

function getMode() {
  const rawMode = process.argv[2] ?? "all";

  if (rawMode === "frontend" || rawMode === "api" || rawMode === "all") {
    return rawMode;
  }

  throw new Error(`Unsupported dev-auto mode "${rawMode}".`);
}

function buildCommands(mode, config) {
  const frontendCommand = `pnpm exec vite --host localhost --port ${config.frontendPort} --strictPort`;
  const apiCommand =
    `npx wrangler pages dev ./dist --local --port ${config.apiPort} --env-file .dev.vars ` +
    `--show-interactive-dev-session=false ` +
    `-b FRONTEND_URL=${config.frontendUrl} -b CORS_ALLOWED_ORIGINS=${config.corsAllowedOrigins}`;

  if (mode === "frontend") {
    return {
      executable: "pnpm",
      args: ["exec", "vite", "--host", "localhost", "--port", String(config.frontendPort), "--strictPort"],
    };
  }

  if (mode === "api") {
    return {
      executable: "npx",
      args: [
        "wrangler",
        "pages",
        "dev",
        "./dist",
        "--local",
        "--port",
        String(config.apiPort),
        "--env-file",
        ".dev.vars",
        "--show-interactive-dev-session=false",
        "-b",
        `FRONTEND_URL=${config.frontendUrl}`,
        "-b",
        `CORS_ALLOWED_ORIGINS=${config.corsAllowedOrigins}`,
      ],
    };
  }

  return {
    executable: "pnpm",
    args: [
      "exec",
      "concurrently",
      "--kill-others-on-fail",
      "--names",
      "web,api",
      "--prefix-colors",
      "cyan,magenta",
      frontendCommand,
      apiCommand,
    ],
  };
}

function printStartupSummary({
  mode,
  config,
  source,
  roleAlreadyRunning,
}) {
  const scriptName =
    mode === "all" ? "dev:all/dev:auto" : mode === "frontend" ? "dev" : "dev:api";

  if (source === "session") {
    console.log(
      `${scriptName}: reusing active session ports ${config.frontendPort}/${config.apiPort} from ${DEV_SESSION_PATH}.`,
    );
  } else if (
    config.frontendPort === DEFAULT_FRONTEND_PORT &&
    config.apiPort === DEFAULT_API_PORT
  ) {
    console.log(
      `${scriptName}: using default ports ${config.frontendPort}/${config.apiPort}.`,
    );
  } else {
    console.log(
      `${scriptName}: default ports ${DEFAULT_FRONTEND_PORT}/${DEFAULT_API_PORT} are busy, using ${config.frontendPort}/${config.apiPort}.`,
    );
  }

  console.log(`Frontend: ${config.frontendUrl}`);
  console.log(`API: ${config.apiUrl}`);

  if (roleAlreadyRunning) {
    console.log(
      `${scriptName}: requested service is already running on that pair, so this command is reusing the live session instead of starting a duplicate process.`,
    );
  }

  if ((mode === "api" || mode === "all") && !existsSync(DIST_INDEX_PATH)) {
    console.warn(
      `${scriptName}: ${DIST_INDEX_PATH} is missing. The API process uses ./dist just like the normal Wrangler dev flow. Run "pnpm run build:dev" if it fails to start.`,
    );
  }
}

async function main() {
  const mode = getMode();
  const fileEnv = parseEnvFile(".dev.vars");
  const baseEnv = { ...fileEnv, ...process.env };

  const selectedPorts = await resolvePortPairForMode({
    mode,
    existingSession: readDevSession(),
  });
  const config = buildDevAutoConfig({
    frontendPort: selectedPorts.frontendPort,
    apiPort: selectedPorts.apiPort,
    baseEnv,
  });

  printStartupSummary({
    mode,
    config,
    source: selectedPorts.source,
    roleAlreadyRunning: selectedPorts.roleAlreadyRunning,
  });

  if (selectedPorts.roleAlreadyRunning) {
    process.exit(0);
  }

  storeDevSession({
    role: mode,
    pid: process.pid,
    config,
  });

  const childEnv = {
    ...baseEnv,
    ...config.envOverrides,
  };

  const command = buildCommands(mode, config);
  const child = spawn(command.executable, command.args, {
    cwd: process.cwd(),
    env: childEnv,
    stdio: "inherit",
  });

  const cleanupSession = () => {
    releaseDevSession({
      role: mode,
      pid: process.pid,
    });
  };

  const shutdown = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  child.on("error", (error) => {
    cleanupSession();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    cleanupSession();

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  releaseDevSession({
    role: getMode(),
    pid: process.pid,
  });
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
