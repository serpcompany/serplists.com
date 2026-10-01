// `pnpm run dev:all`: the Next.js dev server (pages and the API on one origin) on a free
// port, recorded in tmp/dev-session.json so `pnpm run dev:stop`, ui:snap and the Stripe
// listener find it. Output is mirrored to tmp/logs/dev-all.log.
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

  // The start time lets dev:stop and later launches tell this process from an unrelated one
  // that reuses its pid after it exits.
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

  // On Windows this ends the whole tree, so Next.js and workerd do not keep the port.
  const shutdown = (signal) => killProcessTree(child, signal);

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  // Closing the terminal window arrives as SIGHUP on Windows.
  process.on("SIGHUP", () => shutdown("SIGHUP"));

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
