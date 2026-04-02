import { defineConfig } from "@playwright/test";

function shellQuote(value: string) {
  const escapedValue = value.replaceAll("'", `'"'"'`);
  return `'${escapedValue}'`;
}

const frontendHost = process.env.PLAYWRIGHT_FRONTEND_HOST ?? "localhost";
const frontendPort = process.env.PLAYWRIGHT_FRONTEND_PORT ?? "4173";
const frontendBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://${frontendHost}:${frontendPort}`;
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "8788";
const apiBaseUrl =
  process.env.PLAYWRIGHT_API_URL ?? process.env.VITE_API_URL ?? `http://localhost:${apiPort}/api`;
const frontendUrlForApi = process.env.FRONTEND_URL ?? "http://localhost:8080";
const corsAllowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? `${process.env.CORS_ALLOWED_ORIGINS},${frontendBaseUrl}`
  : `${frontendUrlForApi},${frontendBaseUrl}`;
const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER != null
    ? process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1"
    : !process.env.CI;

process.env.VITE_API_URL ??= apiBaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "tests/test-results",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: frontendBaseUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      name: "frontend",
      command: `pnpm exec dotenv -e .dev.vars -- vite --host ${frontendHost} --port ${frontendPort} --strictPort`,
      url: frontendBaseUrl,
      reuseExistingServer,
      timeout: 120000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      name: "api",
      command:
        `pnpm run build:dev && npx wrangler pages dev ./dist --local --port ${apiPort} --env-file .dev.vars ` +
        `-b FRONTEND_URL=${shellQuote(frontendUrlForApi)} ` +
        `-b CORS_ALLOWED_ORIGINS=${shellQuote(corsAllowedOrigins)}`,
      url: `http://localhost:${apiPort}/api/health`,
      reuseExistingServer,
      timeout: 180000,
      stdout: "ignore",
      stderr: "pipe",
      env: {
        ...process.env,
        FRONTEND_URL: frontendUrlForApi,
        CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
      },
    },
  ],
});
