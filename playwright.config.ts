import { defineConfig } from "@playwright/test";
import { APP_URL } from "./tests/e2e/support/stack";
import { disableRequestKeepAlive } from "./tests/e2e/support/request-connections";

// The local app (workerd) closes connections idle for 5 seconds; see request-connections.ts.
disableRequestKeepAlive();

const reuseExistingServer =
  process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER != null
    ? process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1"
    : !process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "tests/test-results",
  fullyParallel: true,
  // One workerd process renders every page and prefetch for the tests. Parallel browsers
  // only queue up behind each other there, until navigations outlast the tests' waits.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: APP_URL,
    // Keep evidence for every failure (retries are off, so "on-first-retry" never fired).
    // CI uploads tests/test-results/ as an artifact when a run fails.
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    name: "app",
    // The OpenNext build (tests/e2e/run-smoke.mjs builds it and seeds its D1) in workerd,
    // pages and API on one origin.
    command: "node tests/e2e/preview-server.mjs",
    url: `${APP_URL}/api/health`,
    reuseExistingServer,
    timeout: 180000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
