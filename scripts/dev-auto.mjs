// `pnpm run dev:all`: the Next.js dev server (pages and the API on one origin) on a free
// port, recorded in tmp/dev-session.json so `pnpm run dev:stop`, ui:snap and the Stripe
// listener find it. Output is mirrored to tmp/logs/dev-all.log.
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
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
import { describeSpawnError, killProcessTree } from "./lib/run-tool.mjs";

const LOG_DIR = "tmp/logs";
const LOG_NAME = "dev-all.log";

// Mirror dev server output into tmp/logs/dev-all.log (ANSI stripped) so agents and humans
// can search it after the fact, e.g. grep '"level":"error"' tmp/logs/dev-all.log
function teeToLogFile(child) {
  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, LOG_NAME);
  const logFile = createWriteStream(logPath, { flags: "w" });
  const ansi = /\x1b\[[0-9;]*[A-Za-z]/g;
  const forward = (source, target) => {
    source.on("data", (chunk) => {
      target.write(chunk);
      logFile.write(chunk.toString().replace(ansi, ""));
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  console.log(`Logs: ${logPath}`);
}

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
  teeToLogFile(child);

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
