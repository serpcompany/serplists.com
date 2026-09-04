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
}) {
  const setup = isolated
    ? "pnpm run sitemap:check && pnpm exec vite build --mode development"
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
  const api =
    `${build}npx wrangler pages dev ./dist --local --port ${apiPort}${envFile}${persist} ` +
    `-b FRONTEND_URL=${frontendUrlForApi} ` +
    `-b CORS_ALLOWED_ORIGINS=${corsAllowedOrigins} ` +
    `-b BETTER_AUTH_SECRET=${betterAuthSecret} ` +
    `-b USESEND_API_KEY= -b RESEND_API_KEY=`;
  return { setup, frontend, api };
}
