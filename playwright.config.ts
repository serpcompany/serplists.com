import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const frontendHost = process.env.PLAYWRIGHT_FRONTEND_HOST ?? "localhost";
const frontendPort = process.env.PLAYWRIGHT_FRONTEND_PORT ?? "4173";
const frontendBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://${frontendHost}:${frontendPort}`;
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "8788";
const apiBaseUrl =
  process.env.PLAYWRIGHT_API_URL ?? process.env.VITE_API_URL ?? `http://localhost:${apiPort}/api`;
const frontendUrlForApi = process.env.FRONTEND_URL ?? frontendBaseUrl;
const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? `${process.env.CORS_ALLOWED_ORIGINS},${frontendBaseUrl}`
  : `${frontendUrlForApi},${frontendBaseUrl}`;
const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET ??
  process.env.JWT_SECRET ??
  "playwright-local-better-auth-secret-32-chars";
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER != null
    ? process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1"
    : !process.env.CI;
const devVarsFlag = existsSync(".dev.vars") ? " --env-file .dev.vars" : "";
// tests/e2e/run-smoke.mjs seeds this directory; quoted because it can contain spaces.
const wranglerPersistFlag = process.env.PLAYWRIGHT_WRANGLER_PERSIST_TO
  ? ` --persist-to "${process.env.PLAYWRIGHT_WRANGLER_PERSIST_TO}"`
  : "";
const frontendCommand = existsSync(".dev.vars")
  ? `pnpm exec dotenv -e .dev.vars -- vite --host ${frontendHost} --port ${frontendPort} --strictPort`
  : `pnpm exec vite --host ${frontendHost} --port ${frontendPort} --strictPort`;

process.env.VITE_API_URL ??= apiBaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "tests/test-results",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: frontendBaseUrl,
    // Keep evidence for every failure (retries are off, so "on-first-retry" never fired).
    // CI uploads tests/test-results/ as an artifact when a run fails.
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      name: "frontend",
      command: frontendCommand,
      url: frontendBaseUrl,
      reuseExistingServer,
      timeout: 120000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      name: "api",
      command:
        `pnpm run build:dev && npx wrangler pages dev ./dist --local --port ${apiPort}${devVarsFlag}${wranglerPersistFlag} ` +
        `-b FRONTEND_URL=${frontendUrlForApi} ` +
        `-b CORS_ALLOWED_ORIGINS=${corsAllowedOrigins} ` +
        `-b BETTER_AUTH_SECRET=${betterAuthSecret}`,
      url: `http://localhost:${apiPort}/api/health`,
      reuseExistingServer,
      timeout: 180000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        ...process.env,
        BETTER_AUTH_SECRET: betterAuthSecret,
        FRONTEND_URL: frontendUrlForApi,
        CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
      },
    },
  ],
});
