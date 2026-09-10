import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const NO_PENDING_MIGRATIONS = "No migrations to apply!";
const PENDING_MIGRATIONS = "Migrations to be applied:";

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

export function evaluateMigrationListResult({ status, stdout = "", error = null }) {
  if (error || status !== 0) {
    return { ok: false, reason: "wrangler_failed" };
  }

  const output = stripAnsi(stdout);
  if (output.includes(PENDING_MIGRATIONS)) {
    return { ok: false, reason: "pending_migrations" };
  }
  if (output.includes(NO_PENDING_MIGRATIONS)) {
    return { ok: true, reason: "no_pending_migrations" };
  }

  return { ok: false, reason: "unrecognized_output" };
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "";
}

function main() {
  const database = readArg("--database");
  const label = readArg("--label") || "target";
  const preview = process.argv.includes("--preview");

  if (!database) {
    console.error("Missing required --database value.");
    process.exitCode = 1;
    return;
  }

  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    command,
    [
      "wrangler",
      "d1",
      "migrations",
      "list",
      database,
      "--remote",
      ...(preview ? ["--preview"] : []),
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const verdict = evaluateMigrationListResult(result);
  if (verdict.ok) {
    console.log(`${label} D1 has no pending migrations (${database}).`);
    return;
  }

  if (verdict.reason === "pending_migrations") {
    console.error(`${label} D1 has pending migrations; deployment is blocked (${database}).`);
  } else if (verdict.reason === "wrangler_failed") {
    console.error(`${label} D1 migration check failed; deployment is blocked (${database}).`);
  } else {
    console.error(`${label} D1 migration status was not recognized; deployment is blocked (${database}).`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
