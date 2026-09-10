import { recordIntegrationScenario } from './data-regression-report-lib.mjs';
import { describe, expect, it } from "vitest";
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildSmokeExecutionPolicy,
  buildPlaywrightServerCommands,
  buildSmokeChildEnvironment,
} from "./smoke-environment-lib.mjs";

describe("isolated smoke child environment", () => {
  it('loads the generated safe env file through the pinned launcher from repository cwd', () => {
    const fixtureHome = mkdtempSync(path.join(tmpdir(), 'smoke-launcher-env-'));
    try {
      const commands = buildPlaywrightServerCommands({ isolated: true,
        wranglerCwd: '.wrangler/smoke-invocation-probe',
        workerPath: '.wrangler/smoke-invocation-probe/pages/_worker.js' });
      const envFile = commands.api.match(/--env-file (\S+)/)?.[1];
      expect(envFile).toBeTruthy();
      const version = execFileSync('npx', ['--no-install', 'wrangler', '--env-file', envFile, '--version'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 15000,
        env: { PATH: process.env.PATH, HOME: fixtureHome, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: path.join(fixtureHome, 'logs') },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      expect(version.trim()).toBe('4.54.0');
    } finally { rmSync(fixtureHome, { recursive: true, force: true }); }
  });
  it("allowlists runtime variables and drops every developer/cloud/email secret sentinel", () => {
    const child = buildSmokeChildEnvironment({
      PATH: "/safe/bin",
      HOME: "/safe/home",
      CI: "1",
      PLAYWRIGHT_SANITIZER_MANIFEST: "tmp/data-evidence/source.manifest.json",
      USESEND_API_KEY: "sentinel-usesend-secret",
      RESEND_API_KEY: "sentinel-resend-secret",
      CLOUDFLARE_API_TOKEN: "sentinel-cloudflare-secret",
      AWS_SECRET_ACCESS_KEY: "sentinel-aws-secret",
      RANDOM_DEVELOPER_SECRET: "sentinel-random-secret",
    });

    expect(child).toMatchObject({ PATH: "/safe/bin", HOME: "/safe/home", CI: "1" });
    expect(child.PLAYWRIGHT_SANITIZER_MANIFEST).toBe("tmp/data-evidence/source.manifest.json");
    expect(JSON.stringify(child)).not.toContain("sentinel");
    expect(child).not.toHaveProperty("USESEND_API_KEY");
    expect(child).not.toHaveProperty("CLOUDFLARE_API_TOKEN");
    recordIntegrationScenario('smoke-child-secret-allowlist');
  });

  it("never reads .dev.vars from frontend build or API commands in isolated mode", () => {
    const commands = buildPlaywrightServerCommands({
      isolated: true,
      hasDevVars: true,
      frontendHost: "localhost",
      frontendPort: "4173",
      apiPort: "8788",
      frontendUrlForApi: "http://localhost:4173",
      corsAllowedOrigins: "http://localhost:4173",
      betterAuthSecret: "synthetic-test-secret-32-characters",
      persistPath: ".wrangler/smoke-state",
      workerPath: "tmp/playwright-pages-runtime/_worker.js",
    });

    expect(commands.setup).not.toContain("dotenv");
    expect(commands.setup).not.toContain("sitemap:check");
    expect(commands.setup).not.toContain("sitemap:generate");
    expect(commands.setup).toContain("vite build --mode development");
    expect(commands.setup).toContain("pages functions build");
    expect(commands.frontend).not.toContain("dotenv");
    expect(commands.frontend).toContain("vite preview");
    expect(commands.frontend).not.toContain("vite --host");
    expect(commands.api).not.toContain(".dev.vars");
    expect(commands.api).not.toContain("build:dev");
    expect(commands.api).not.toContain("vite build");
    expect(commands.api).toContain("tests/fixtures/playwright-safe.env");
    expect(commands.api).toContain("pages dev tmp/playwright-pages-runtime");
    expect(commands.api).not.toContain('--script-path');
    expect(commands.api).not.toContain('--no-bundle');
    expect(commands.api).toContain("-b USESEND_API_KEY=");
    expect(commands.api).toContain("-b RESEND_API_KEY=");
  });

  it("serializes the isolated shared-state browser matrix instead of load-testing a cold local server", () => {
    expect(buildSmokeExecutionPolicy({ isolated: true })).toEqual({
      fullyParallel: false,
      workers: 1,
    });
    expect(buildSmokeExecutionPolicy({ isolated: false })).toEqual({
      fullyParallel: true,
      workers: undefined,
    });
  });
});
