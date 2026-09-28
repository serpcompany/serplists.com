#!/usr/bin/env node
// Look at a page of the running app without a browser integration.
//   pnpm run ui:snap -- dashboard/templates --login john@test.com [--mobile] [--out tmp/snapshots/x.png]
// Flags may come before or after the route. Saves a full-page screenshot and prints the
// accessibility tree (readable text), console errors, and failed requests. Start the app
// first with `pnpm run dev:all`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, devices } from "@playwright/test";
import { parseUiSnapArgs, UI_SNAP_USAGE } from "./ui-snapshot-lib.mjs";

let options;
try {
  options = parseUiSnapArgs(process.argv.slice(2));
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n${UI_SNAP_USAGE}`);
  process.exit(2);
}
const { routePath, outPath } = options;

let ports = { frontendPort: 8080, apiPort: 8788 };
try {
  ports = { ...ports, ...JSON.parse(readFileSync("tmp/dev-session.json", "utf8")) };
} catch {
  // No dev session file: fall back to the default port pair.
}
const baseUrl = options.base ?? `http://localhost:${ports.frontendPort}`;
const apiUrl = options.api ?? `http://localhost:${ports.apiPort}/api`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext(options.mobile ? devices["iPhone 13"] : { viewport: { width: 1440, height: 900 } });
  const email = options.login;
  if (email) {
    const response = await context.request.post(`${apiUrl}/auth/sign-in/email`, {
      data: { email, password: options.password ?? "password123" },
      headers: { Origin: baseUrl },
    });
    if (!response.ok()) {
      throw new Error(`Sign-in as ${email} failed (${response.status()}). Seed users with \`pnpm run db:seed\`.`);
    }
  }

  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.request().method()} ${response.url()}`);
  });

  await page.goto(new URL(routePath, baseUrl).toString(), { waitUntil: "networkidle" });
  mkdirSync(path.dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: true });
  const aria = await page.locator("body").ariaSnapshot();
  writeFileSync(outPath.replace(/\.png$/, ".aria.yml"), aria);

  console.log(`URL:        ${page.url()}`);
  console.log(`Title:      ${await page.title()}`);
  console.log(`Screenshot: ${outPath}`);
  console.log(`Console errors (${consoleErrors.length}):${consoleErrors.map((line) => `\n  ${line}`).join("")}`);
  console.log(`Failed requests (${failedRequests.length}):${failedRequests.map((line) => `\n  ${line}`).join("")}`);
  console.log(`\nAccessibility tree:\n${aria}`);
} finally {
  await browser.close();
}
