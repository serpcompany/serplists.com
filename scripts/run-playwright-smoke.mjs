import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { rmSync, readdirSync, readFileSync } from "node:fs";
import { routeFragmentDirectory, finalizeRouteCoverage } from "./data/route-coverage-evidence.mjs";
import { prepareSanitizedSmoke } from "./data/prepare-sanitized-smoke.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOpenPortPair } from "./dev-auto-lib.mjs";
import {
  buildPlaywrightServerCommands,
  buildSmokeChildEnvironment,
} from "./data/smoke-environment-lib.mjs";
import { cleanupSmokeState } from "./data/smoke-teardown-lib.mjs";
import { acquireSmokeRunLock } from "./data/smoke-run-lock-lib.mjs";

const DEFAULT_SMOKE_FRONTEND_PORT = 4173;
const DEFAULT_SMOKE_API_PORT = 8788;
const DATABASE_NAME = "serp-checklists-db";
const NPX_COMMAND = process.platform === "win32" ? "cmd.exe" : "npx";
const NPX_ARGS_PREFIX = process.platform === "win32" ? ["/d", "/s", "/c", "npx"] : [];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const smokePersistPath = path.join(".wrangler", "smoke-state");
const smokePersistAbsolutePath = path.resolve(repoRoot, smokePersistPath);
const smokeTransientAbsolutePath = path.resolve(repoRoot, ".wrangler", "tmp");
const smokeLockAbsolutePath = path.resolve(repoRoot, ".wrangler", "smoke-state.lock");
const teardownReportPath = path.resolve(
  repoRoot,
  process.env.PLAYWRIGHT_TEARDOWN_REPORT ?? "tmp/data-reports/browser-smoke-teardown.json",
);
const env = buildSmokeChildEnvironment(process.env);
env.DATA_REGRESSION_START_COMMIT ??= execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const migrationFiles = readdirSync(path.join(repoRoot, 'db/migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort();
env.DATA_REGRESSION_MIGRATION_FROM ??= migrationFiles[0];
env.DATA_REGRESSION_MIGRATION_TO ??= migrationFiles.at(-1);

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function buildLocalUrl(port) {
  return `http://localhost:${port}`;
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    env: {
      ...env,
      ...options.env,
    },
    stdio: "inherit",
  });
}

function prepareSmokeD1() {
  const wranglerStateRoot = path.resolve(repoRoot, ".wrangler");

  if (!smokePersistAbsolutePath.startsWith(wranglerStateRoot)) {
    throw new Error(`Refusing to reset unexpected smoke D1 path: ${smokePersistAbsolutePath}`);
  }

  rmSync(smokePersistAbsolutePath, { recursive: true, force: true });
  rmSync(smokeTransientAbsolutePath, { recursive: true, force: true });
  if (env.PLAYWRIGHT_SANITIZED_REHEARSAL_SQL) {
    prepareSanitizedSmoke({ repoRoot, persistPath: smokePersistAbsolutePath, env, wrangler: (args) => execFileSync(NPX_COMMAND, [...NPX_ARGS_PREFIX, "wrangler", ...args], { cwd: repoRoot, env: { ...env, CI: "1" }, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }) });
    return;
  }
  run(
    NPX_COMMAND,
    [
      ...NPX_ARGS_PREFIX,
      "wrangler",
      "d1",
      "migrations",
      "apply",
      DATABASE_NAME,
      "--local",
      "--persist-to",
      smokePersistPath,
    ],
    {
      env: {
        CI: "1",
      },
    },
  );
}

env.PLAYWRIGHT_REUSE_EXISTING_SERVER = "0";
// Smoke accounts and data must be deterministic and must never call developer-
// configured external email providers from .dev.vars.
env.PLAYWRIGHT_USE_DEV_VARS = "0";

const shouldPickOpenPorts =
  env.PLAYWRIGHT_REUSE_EXISTING_SERVER !== "1" &&
  env.PLAYWRIGHT_BASE_URL == null &&
  env.PLAYWRIGHT_FRONTEND_PORT == null &&
  env.PLAYWRIGHT_API_PORT == null &&
  env.PLAYWRIGHT_API_URL == null &&
  env.VITE_API_URL == null;

if (shouldPickOpenPorts) {
  const { frontendPort, apiPort } = await findOpenPortPair({
    preferredFrontendPort: DEFAULT_SMOKE_FRONTEND_PORT,
    preferredApiPort: DEFAULT_SMOKE_API_PORT,
  });

  const frontendUrl = buildLocalUrl(frontendPort);
  const apiUrl = `${buildLocalUrl(apiPort)}/api`;

  env.PLAYWRIGHT_FRONTEND_PORT = String(frontendPort);
  env.PLAYWRIGHT_API_PORT = String(apiPort);
  env.PLAYWRIGHT_BASE_URL = frontendUrl;
  env.PLAYWRIGHT_API_URL = apiUrl;
  env.PLAYWRIGHT_WRANGLER_PERSIST_TO = smokePersistPath;
  env.VITE_API_URL = apiUrl;
  env.FRONTEND_URL ??= frontendUrl;

  console.log(`Smoke tests using ${frontendUrl} and ${apiUrl}`);
} else {
  const frontendPort = parsePort(
    env.PLAYWRIGHT_FRONTEND_PORT,
    DEFAULT_SMOKE_FRONTEND_PORT,
  );
  const apiPort = parsePort(env.PLAYWRIGHT_API_PORT, DEFAULT_SMOKE_API_PORT);

  env.PLAYWRIGHT_BASE_URL ??= buildLocalUrl(frontendPort);
  env.PLAYWRIGHT_API_URL ??= `${buildLocalUrl(apiPort)}/api`;
  env.VITE_API_URL ??= env.PLAYWRIGHT_API_URL;
  env.FRONTEND_URL ??= env.PLAYWRIGHT_BASE_URL;
}

const releaseSmokeLock = env.PLAYWRIGHT_SMOKE_LOCK_HELD === "1"
  ? () => {}
  : await acquireSmokeRunLock({ lockPath: smokeLockAbsolutePath });
try {
  run(process.execPath, ['--test', 'scripts/data/route-coverage.node-test.mjs']);
  const fragments = path.resolve(repoRoot, routeFragmentDirectory(env));
  if (!fragments.startsWith(path.join(repoRoot, 'tmp') + path.sep)) throw new Error('Route coverage artifacts must stay under repository tmp/');
  rmSync(fragments, { recursive: true, force: true });
  prepareSmokeD1();
  const ledgerOutput = execFileSync(NPX_COMMAND, [...NPX_ARGS_PREFIX, 'wrangler', 'd1', 'execute', DATABASE_NAME, '--local', '--persist-to', smokePersistPath, '--command', 'SELECT name FROM d1_migrations ORDER BY id', '--json'], { cwd: repoRoot, env: { ...env, CI: '1' }, encoding: 'utf8' });
  const ledger = JSON.parse(ledgerOutput)[0].results.map(row => row.name);
  if (JSON.stringify(ledger) !== JSON.stringify(migrationFiles)) throw new Error('Real route database migration ledger does not match the full repository chain');
  env.PLAYWRIGHT_ROUTE_LEDGER_JSON = JSON.stringify(ledger.map(name => ({ name, sha256: createHash('sha256').update(readFileSync(path.join(repoRoot, 'db/migrations', name))).digest('hex') })));
  run(NPX_COMMAND, [...NPX_ARGS_PREFIX, "wrangler", "d1", "execute", DATABASE_NAME, "--local", "--persist-to", smokePersistPath, "--file", "scripts/data/sql/route-coverage-fixtures.sql", "--yes"]);
  const setupCommands = buildPlaywrightServerCommands({
    isolated: true,
    hasDevVars: false,
    frontendHost: "localhost",
    frontendPort: env.PLAYWRIGHT_FRONTEND_PORT,
    apiPort: env.PLAYWRIGHT_API_PORT,
    frontendUrlForApi: env.FRONTEND_URL,
    corsAllowedOrigins: env.FRONTEND_URL,
    betterAuthSecret: "playwright-local-better-auth-secret-32-chars",
    persistPath: smokePersistPath,
  });
  if (!setupCommands.setup) throw new Error("Isolated smoke setup command is missing.");
  run(process.platform === "win32" ? "cmd.exe" : "sh", [
    ...(process.platform === "win32" ? ["/d", "/s", "/c"] : ["-c"]),
    setupCommands.setup,
  ]);
} catch (error) {
  cleanupSmokeState({
    repoRoot,
    statePath: smokePersistAbsolutePath,
    transientPaths: [smokeTransientAbsolutePath],
    reportPath: teardownReportPath,
  });
  releaseSmokeLock();
  throw error;
}

const pnpmBin = "pnpm";
const child = spawn(
  pnpmBin,
  ["exec", "playwright", "test", "--grep", "@smoke|@real-d1", ...process.argv.slice(2)],
  {
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  },
);

child.on("exit", async (code, signal) => {
  let finalCode = code ?? 1;
  const includesRouteSuite = !process.argv.slice(2).some(arg => arg.includes('.spec.')) || process.argv.slice(2).some(arg => arg.includes('real-d1'));
  if (includesRouteSuite) {
    try {
      // Additional real Worker families contribute independently validated fragments.
      if (finalCode === 0 && !signal) {
        const { runAdminBillingSitemapCoverage } = await import('./data/run-admin-billing-sitemap-coverage.mjs');
        await runAdminBillingSitemapCoverage({ repoRoot, persistPath: smokePersistAbsolutePath, env });
      }
      finalizeRouteCoverage(env, repoRoot, { browserPassed: finalCode === 0 && !signal });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      finalCode = 1;
    }
  }
  if (finalCode === 0 && !signal && includesRouteSuite) {
    try {
      run(NPX_COMMAND, [...NPX_ARGS_PREFIX, "wrangler", "d1", "execute", DATABASE_NAME, "--local", "--persist-to", smokePersistPath, "--file", "scripts/data/sql/route-coverage-missing-column.sql", "--yes"]);
      finalCode = await new Promise(resolve => {
        const negative = spawn(pnpmBin, ["exec", "playwright", "test", "tests/e2e/real-d1-routes.spec.ts", "--grep", "@real-d1-negative"], {
          env: { ...env, PLAYWRIGHT_ROUTE_NEGATIVE: "1", ...(env.PLAYWRIGHT_JSON_REPORT ? { PLAYWRIGHT_JSON_REPORT: env.PLAYWRIGHT_JSON_REPORT.replace(/\.json$/, "-route-negative.json") } : {}) },
          shell: process.platform === "win32", stdio: "inherit",
        });
        negative.on('exit', code => resolve(code ?? 1));
        negative.on('error', () => resolve(1));
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      finalCode = 1;
    }
  }
  const teardown = cleanupSmokeState({
    repoRoot,
    statePath: smokePersistAbsolutePath,
    transientPaths: [smokeTransientAbsolutePath],
    reportPath: teardownReportPath,
  });
  releaseSmokeLock();
  if (signal) {
    console.error(`Smoke tests stopped by ${signal}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = teardown.verdict === "pass" ? finalCode : 1;
});

child.on("error", (error) => {
  cleanupSmokeState({
    repoRoot,
    statePath: smokePersistAbsolutePath,
    transientPaths: [smokeTransientAbsolutePath],
    reportPath: teardownReportPath,
  });
  releaseSmokeLock();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
