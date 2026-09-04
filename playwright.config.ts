import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import {
  buildPlaywrightServerCommands,
  buildSmokeExecutionPolicy,
} from "./scripts/data/smoke-environment-lib.mjs";

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
const wranglerPersistFlag = process.env.PLAYWRIGHT_WRANGLER_PERSIST_TO
  ? process.env.PLAYWRIGHT_WRANGLER_PERSIST_TO
  : "";
const serverCommands = buildPlaywrightServerCommands({
  isolated: process.env.PLAYWRIGHT_USE_DEV_VARS === "0",
  hasDevVars: existsSync(".dev.vars"),
  frontendHost,
  frontendPort,
  apiPort,
  frontendUrlForApi,
  corsAllowedOrigins,
  betterAuthSecret,
  persistPath: wranglerPersistFlag,
});
const executionPolicy = buildSmokeExecutionPolicy({
  isolated: process.env.PLAYWRIGHT_USE_DEV_VARS === "0",
});
const reporter = process.env.PLAYWRIGHT_JSON_REPORT
  ? [
      ["list"] as const,
      ["json", { outputFile: process.env.PLAYWRIGHT_JSON_REPORT }] as const,
    ]
  : "list";

process.env.VITE_API_URL ??= apiBaseUrl;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "tests/test-results",
  fullyParallel: executionPolicy.fullyParallel,
  workers: executionPolicy.workers,
  reporter,
  use: {
    baseURL: frontendBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      name: "frontend",
      command: serverCommands.frontend,
      url: frontendBaseUrl,
      reuseExistingServer,
      timeout: 120000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      name: "api",
      command: serverCommands.api,
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
