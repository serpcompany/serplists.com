import { spawn } from "node:child_process";
import {
  buildDevServerCommand,
  buildDevServerConfig,
  DEFAULT_DEV_PORT,
  DEV_SESSION_PATH,
  parseEnvFile,
  readDevSession,
  releaseDevSession,
  resolveDevServerPort,
  writeDevSession,
} from "./dev-auto-lib.mjs";
import { currentProcessStartedAt } from "./lib/process-info.mjs";
import { DEV_LOG_PATH, mirrorOutputToLog } from "./lib/log-mirror.mjs";
import { describeSpawnError, killProcessTree } from "./lib/run-tool.mjs";

async function main() {
  const baseEnv = { ...parseEnvFile(".dev.vars"), ...process.env };
  const selected = await resolveDevServerPort({ existingSession: readDevSession() });

  if (selected.running) {
    console.log(
      `dev:all is already running at http://localhost:${selected.port} (pid ${selected.pid}, recorded in ${DEV_SESSION_PATH}). ` +
        "Stop it with `pnpm run dev:stop`.",
    );
    process.exit(0);
  }

  const config = buildDevServerConfig({ port: selected.port, baseEnv });
  if (config.port !== DEFAULT_DEV_PORT) {
    console.log(`dev:all: port ${DEFAULT_DEV_PORT} is busy, using ${config.port}.`);
  }
  console.log(`App and API: ${config.origin} (API at ${config.origin}/api)`);

  writeDevSession({ port: config.port, pid: process.pid, startedAt: currentProcessStartedAt() });

  const command = buildDevServerCommand({ config, baseEnv });
  const child = spawn(command.command, command.args, {
    ...command.options,
    cwd: process.cwd(),
    env: { ...command.env, FORCE_COLOR: command.env.FORCE_COLOR ?? "1" },
    stdio: ["inherit", "pipe", "pipe"],
  });
  mirrorOutputToLog(child, DEV_LOG_PATH);
  console.log(`Logs: ${DEV_LOG_PATH} (query them with pnpm run logs:query)`);

  const cleanupSession = () => releaseDevSession({ pid: process.pid });

  const stopTheServerAndEverythingItStarted = (signal) => killProcessTree(child, signal);

  process.on("SIGINT", () => stopTheServerAndEverythingItStarted("SIGINT"));
  process.on("SIGTERM", () => stopTheServerAndEverythingItStarted("SIGTERM"));
  process.on("SIGHUP", () => stopTheServerAndEverythingItStarted("SIGHUP"));

  child.on("error", (error) => {
    cleanupSession();
    console.error(describeSpawnError(error, command.label));
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
  releaseDevSession({ pid: process.pid });
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
