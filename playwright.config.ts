import { defineConfig } from "@playwright/test";
import { APP_URL } from "./tests/e2e/support/stack";
import { disableRequestKeepAlive } from "./tests/e2e/support/request-connections";

disableRequestKeepAlive();

const reuseExistingServer =
  process.env["PLAYWRIGHT_REUSE_EXISTING_SERVER"] != null
    ? process.env["PLAYWRIGHT_REUSE_EXISTING_SERVER"] === "1"
    : !process.env["CI"];

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "tests/test-results",
  fullyParallel: true,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: APP_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    name: "app",
    command: "node --import tsx tests/e2e/preview-server.ts",
    url: `${APP_URL}/api/health`,
    reuseExistingServer,
    timeout: 180000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
