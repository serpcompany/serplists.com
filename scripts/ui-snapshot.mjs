#!/usr/bin/env node
// Look at a page of the running app without a browser integration.
//   pnpm run ui:snap -- dashboard/templates --login john@test.com [--mobile] [--out tmp/snapshots/x.png]
// Saves a full-page screenshot and prints the accessibility tree (readable text),
// console errors, and failed requests. Start the app first with `pnpm run dev:all`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, devices } from "@playwright/test";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
// Routes may omit the leading slash (`dashboard`), which Git Bash would otherwise rewrite into a file path.
const routeArg = args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--")) ?? "";
const routePath = routeArg.startsWith("/") ? routeArg : `/${routeArg}`;

let ports = { frontendPort: 8080, apiPort: 8788 };
try {
  ports = { ...ports, ...JSON.parse(readFileSync("tmp/dev-session.json", "utf8")) };
} catch {
  // No dev session file: fall back to the default port pair.
}
const baseUrl = flag("base") ?? `http://localhost:${ports.frontendPort}`;
const apiUrl = flag("api") ?? `http://localhost:${ports.apiPort}/api`;
const slug = routePath.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";
const outPath = flag("out") ?? path.join("tmp", "snapshots", `${slug}.png`);

const browser = await chromium.launch();
try {
  const context = await browser.newContext(args.includes("--mobile") ? devices["iPhone 13"] : { viewport: { width: 1440, height: 900 } });
  const email = flag("login");
  if (email) {
    const response = await context.request.post(`${apiUrl}/auth/sign-in/email`, {
      data: { email, password: flag("password") ?? "password123" },
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
