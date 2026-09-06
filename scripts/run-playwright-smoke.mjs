import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { rmSync, readdirSync, readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { routeFragmentDirectory, finalizeRouteCoverage } from "./data/route-coverage-evidence.mjs";
import { prepareSanitizedSmoke } from "./data/prepare-sanitized-smoke.mjs";
import { captureSanitizedState, verifySanitizedRefusalPreservation, validateSanitizedCohortProof, validateSanitizedStateBinding } from './data/sanitized-state-lib.mjs';
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOpenPortPair } from "./dev-auto-lib.mjs";
import {
  buildPlaywrightServerCommands,
  buildSmokeChildEnvironment,
} from "./data/smoke-environment-lib.mjs";
import { cleanupSmokeState, createSmokeWorkspace } from "./data/smoke-teardown-lib.mjs";
import { acquireSmokeRunLock } from "./data/smoke-run-lock-lib.mjs";
import { browserGateArguments } from './data/runtime-gate-contract.mjs';
import { normalizeMigrationRange } from './data/migration-range-lib.mjs';

const DEFAULT_SMOKE_FRONTEND_PORT = 4173;
const DEFAULT_SMOKE_API_PORT = 8788;
const DATABASE_NAME = "serp-checklists-db";
const NPX_COMMAND = process.platform === "win32" ? "cmd.exe" : "npx";
const NPX_ARGS_PREFIX = process.platform === "win32" ? ["/d", "/s", "/c", "npx"] : [];
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const invocation = browserGateArguments(process.argv.slice(2));
let workspace;
let smokePersistPath;
let smokePersistAbsolutePath;
const smokeLockAbsolutePath = path.resolve(repoRoot, ".wrangler", "smoke-state.lock");
let instrumentedWorkerPath;
let instrumentedPagesDirectory;
const teardownReportPath = path.resolve(
  repoRoot,
  process.env.PLAYWRIGHT_TEARDOWN_REPORT ?? "tmp/data-reports/browser-smoke-teardown.json",
);
const env = buildSmokeChildEnvironment(process.env);
env.DATA_REGRESSION_START_COMMIT ??= execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const migrationFiles = readdirSync(path.join(repoRoot, 'db/migrations')).filter(name => /^\d+.*\.sql$/.test(name)).sort();
const selectedRange = normalizeMigrationRange({ from: env.DATA_REGRESSION_MIGRATION_FROM ?? null, to: env.DATA_REGRESSION_MIGRATION_TO ?? null });
env.DATA_REGRESSION_MIGRATION_FROM = selectedRange.from ?? 'none';
env.DATA_REGRESSION_MIGRATION_TO = selectedRange.to ?? 'none';
env.PLAYWRIGHT_JSON_REPORT ??= path.join(repoRoot, 'tmp/data-reports/browser-smoke-playwright.json');
env.PLAYWRIGHT_ROUTE_QUERY_EVIDENCE = invocation.gating ? '1' : '0';

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

function buildLocalUrl(port) {
  return `http://localhost:${port}`;
}

function run(command, args, options = {}) {
  if (command === NPX_COMMAND && args[NPX_ARGS_PREFIX.length] === 'wrangler') {
    return runWrangler(args.slice(NPX_ARGS_PREFIX.length + 1), { stdio: 'inherit', ...options });
  }
  execFileSync(command, args, {
    cwd: repoRoot,
    env: {
      ...env,
      ...options.env,
    },
    stdio: "inherit",
  });
}

function runWrangler(args, options = {}) {
  args = args.map((arg, index) => args[index - 1] === '--file' ? path.resolve(repoRoot, arg) : arg);
  return execFileSync(NPX_COMMAND, [...NPX_ARGS_PREFIX, 'wrangler', '--cwd', workspace.root,
    ...(!args.includes('--config') ? ['--config', path.join(workspace.root, 'wrangler.toml')] : []), ...args], {
    cwd: repoRoot, encoding: 'utf8', ...options, env: { ...env, CI: '1', ...options.env },
  });
}

function prepareSmokeD1() {
  if (env.PLAYWRIGHT_SANITIZED_REHEARSAL_SQL) {
    prepareSanitizedSmoke({ repoRoot, persistPath: smokePersistAbsolutePath, env, wrangler: args => runWrangler(args, { stdio: ['ignore', 'pipe', 'inherit'] }) });
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
  workspace = createSmokeWorkspace({ repoRoot });
  smokePersistAbsolutePath = smokePersistPath = workspace.statePath;
  instrumentedWorkerPath = path.relative(repoRoot, workspace.workerPath);
  instrumentedPagesDirectory = path.dirname(workspace.workerPath);
  // Wrangler 4.54.0 src/pages/utils.ts finds the nearest package.json from cwd;
  // src/paths.ts creates .wrangler/tmp under that project root. --persist-to
  // controls D1 state separately. No Wrangler temp-root environment flag exists.
  writeFileSync(path.join(workspace.root, 'package.json'), '{"private":true}');
  writeFileSync(path.join(workspace.root, 'wrangler.toml'), readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8')
    .replaceAll('migrations_dir = "db/migrations"', `migrations_dir = ${JSON.stringify(path.join(repoRoot, 'db/migrations'))}`)
    .replace('pages_build_output_dir = "dist"', 'pages_build_output_dir = "pages"'));
  mkdirSync(path.join(workspace.root, 'os-tmp'));
  env.TMPDIR = env.TMP = env.TEMP = path.join(workspace.root, 'os-tmp');
  env.PLAYWRIGHT_WRANGLER_CWD = path.relative(repoRoot, workspace.root);
  env.PLAYWRIGHT_WRANGLER_PERSIST_TO = smokePersistPath;
  env.PLAYWRIGHT_INSTRUMENTED_WORKER_PATH = instrumentedWorkerPath;
  mkdirSync(instrumentedPagesDirectory, {recursive:true});
  run(process.execPath, ['--experimental-vm-modules', '--test', 'scripts/data/route-coverage.node-test.mjs', 'scripts/data/smoke-runner-ownership.node-test.mjs']);
  const fragments = path.resolve(repoRoot, routeFragmentDirectory(env));
  if (!fragments.startsWith(path.join(repoRoot, 'tmp') + path.sep)) throw new Error('Route coverage artifacts must stay under repository tmp/');
  rmSync(fragments, { recursive: true, force: true });
  prepareSmokeD1();
  const ledgerOutput = runWrangler(['d1', 'execute', DATABASE_NAME, '--local', '--persist-to', smokePersistPath, '--command', 'SELECT name FROM d1_migrations ORDER BY id', '--json']);
  const ledger = JSON.parse(ledgerOutput)[0].results.map(row => row.name);
  if (JSON.stringify(ledger) !== JSON.stringify(migrationFiles)) throw new Error('Real route database migration ledger does not match the full repository chain');
  env.PLAYWRIGHT_ROUTE_LEDGER_JSON = JSON.stringify(ledger.map(name => ({ name, sha256: createHash('sha256').update(readFileSync(path.join(repoRoot, 'db/migrations', name))).digest('hex') })));
  // Full E2E includes the historical local Admin/SERP personas. Seed only this
  // freshly migrated isolated target, after sanitized-state capture, never dev D1.
  for (const fixture of ['db/seeds/test-data.sql', 'db/seeds/official-templates.sql', 'db/seeds/official-local-login.sql']) {
    run(NPX_COMMAND, [...NPX_ARGS_PREFIX, 'wrangler', 'd1', 'execute', DATABASE_NAME, '--local', '--persist-to', smokePersistPath, '--file', fixture, '--yes']);
  }
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
    instrumentedWorkerPath,
  });
  if (!setupCommands.setup) throw new Error("Isolated smoke setup command is missing.");
  run(process.platform === "win32" ? "cmd.exe" : "sh", [
    ...(process.platform === "win32" ? ["/d", "/s", "/c"] : ["-c"]),
    setupCommands.setup,
  ]);
  // Advanced-mode Pages finds _worker.js inside its served asset directory.
  // Keep this entire test-only bundle outside the production dist output.
  const distDirectory = path.join(repoRoot, 'dist');
  cpSync(distDirectory, instrumentedPagesDirectory, {recursive:true,filter:source => source !== path.join(distDirectory, '_worker.js')});
  const pnpmBin = "pnpm";
  const { code, signal } = await new Promise((resolve, reject) => {
    const child = spawn(
      pnpmBin,
      ["exec", "playwright", "test", ...invocation.args],
      {
        env,
        shell: process.platform === "win32",
        stdio: "inherit",
      },
    );
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  let finalCode = code ?? 1;
  if (finalCode === 0 && !signal && env.PLAYWRIGHT_SANITIZED_REHEARSAL_SQL) {
    try {
      const before = JSON.parse(readFileSync(env.PLAYWRIGHT_REHEARSAL_STATE, 'utf8'));
      const proof = JSON.parse(readFileSync(env.PLAYWRIGHT_REHEARSAL_PROOF, 'utf8'));
      const after = captureSanitizedState({ sourceSha256: before.sourceSha256, query: sql => runWrangler(['d1', 'execute', DATABASE_NAME, '--local', '--persist-to', smokePersistPath, '--command', sql, '--json']) });
      proof.cohortProof.postHandlerPreservation = verifySanitizedRefusalPreservation({ before, after, proof });
      validateSanitizedStateBinding(proof.postMigrationState, before);
      validateSanitizedCohortProof(proof.cohortProof, { state: before, selection: JSON.parse(readFileSync(env.PLAYWRIGHT_SANITIZER_MANIFEST, 'utf8')).selection });
      writeFileSync(env.PLAYWRIGHT_REHEARSAL_PROOF, JSON.stringify(proof, null, 2));
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); finalCode = 1; }
  }
  const includesRouteSuite = invocation.gating;
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
          env: { ...env, PLAYWRIGHT_ROUTE_NEGATIVE: "1", PLAYWRIGHT_ROUTE_QUERY_EVIDENCE: "0", ...(env.PLAYWRIGHT_JSON_REPORT ? { PLAYWRIGHT_JSON_REPORT: env.PLAYWRIGHT_JSON_REPORT.replace(/\.json$/, "-route-negative.json") } : {}) },
          shell: process.platform === "win32", stdio: "inherit",
        });
        negative.on('close', code => resolve(code ?? 1));
        negative.on('error', () => resolve(1));
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      finalCode = 1;
    }
  }
  if (signal) {
    console.error(`Smoke tests stopped by ${signal}`);
  }
  process.exitCode = signal ? 1 : finalCode;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    if (workspace) {
      const teardown = cleanupSmokeState({ repoRoot, statePath: workspace.statePath,
        transientPaths: workspace.transientPaths, ownership: workspace, reportPath: teardownReportPath });
      if (teardown.verdict !== 'pass') process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally { releaseSmokeLock(); }
}
