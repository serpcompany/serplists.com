import path from 'node:path';

const ALLOWED_PARENT_ENVIRONMENT = [
  "PATH",
  "HOME",
  "USER",
  "TMPDIR",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
  "CI",
  "FORCE_COLOR",
  "NO_COLOR",
  "PNPM_HOME",
  "COREPACK_HOME",
  "COREPACK_ENABLE_AUTO_PIN",
  "NODE_OPTIONS",
  "PLAYWRIGHT_JSON_REPORT",
  "PLAYWRIGHT_SMOKE_LOCK_HELD",
  "PLAYWRIGHT_SANITIZED_REHEARSAL_SQL",
  "PLAYWRIGHT_SANITIZER_SHA256",
  "PLAYWRIGHT_SANITIZER_MANIFEST",
  "PLAYWRIGHT_REHEARSAL_PROOF",
  "PLAYWRIGHT_REHEARSAL_STATE",
  "PLAYWRIGHT_ROUTE_COVERAGE_PROOF",
  "PLAYWRIGHT_ROUTE_NEGATIVE",
  "DATA_REGRESSION_START_COMMIT",
  "DATA_REGRESSION_MIGRATION_FROM",
  "DATA_REGRESSION_MIGRATION_TO",
  "PLAYWRIGHT_CANDIDATE_AUTH_PROOF",
];

export function buildSmokeChildEnvironment(parentEnvironment) {
  return Object.fromEntries(
    ALLOWED_PARENT_ENVIRONMENT
      .filter((name) => typeof parentEnvironment[name] === "string")
      .map((name) => [name, parentEnvironment[name]]),
  );
}

export function buildSmokeExecutionPolicy({ isolated }) {
  return isolated
    ? { fullyParallel: false, workers: 1 }
    : { fullyParallel: true, workers: undefined };
}

export function buildPlaywrightServerCommands({
  isolated,
  hasDevVars,
  frontendHost,
  frontendPort,
  apiPort,
  frontendUrlForApi,
  corsAllowedOrigins,
  betterAuthSecret,
  persistPath,
  instrumentedWorkerPath,
}) {
  const setup = isolated
    ? `pnpm exec vite build --mode development${instrumentedWorkerPath ? ` && node scripts/data/build-instrumented-playwright-worker.mjs --output ${instrumentedWorkerPath}` : ''}`
    : null;
  const frontend = !isolated && hasDevVars
    ? `pnpm exec dotenv -e .dev.vars -- vite --host ${frontendHost} --port ${frontendPort} --strictPort`
    : isolated
      ? `pnpm exec vite preview --host ${frontendHost} --port ${frontendPort} --strictPort`
      : `pnpm exec vite --host ${frontendHost} --port ${frontendPort} --strictPort`;
  const build = isolated ? "" : "pnpm run build:dev && ";
  const envFile = isolated
    ? " --env-file tests/fixtures/playwright-safe.env"
    : hasDevVars ? " --env-file .dev.vars" : "";
  const persist = persistPath ? ` --persist-to ${persistPath}` : "";
  if (instrumentedWorkerPath && path.basename(instrumentedWorkerPath) !== '_worker.js') throw new Error('Instrumented Pages must use a test-only _worker.js asset entrypoint.');
  const pagesDirectory = instrumentedWorkerPath ? path.dirname(instrumentedWorkerPath) : './dist';
  const api =
    `${build}npx wrangler pages dev ${pagesDirectory} --local --port ${apiPort}${envFile}${persist} ` +
    `-b FRONTEND_URL=${frontendUrlForApi} ` +
    `-b CORS_ALLOWED_ORIGINS=${corsAllowedOrigins} ` +
    `-b BETTER_AUTH_SECRET=${betterAuthSecret} ` +
    `-b USESEND_API_KEY= -b RESEND_API_KEY=`;
  return { setup, frontend, api };
}
