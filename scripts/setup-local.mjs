#!/usr/bin/env node
// One-command, re-runnable local setup for a fresh clone or git worktree:
//   pnpm install && pnpm run setup && pnpm run dev:all
// - creates .dev.vars from .dev.vars.example with a generated auth secret (never overwrites)
// - creates and seeds local D1 if this checkout has none; otherwise applies pending migrations
// - installs the Playwright browser used by e2e tests and `pnpm run ui:snap`
// - builds dist/ for the API dev server if it is missing
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devVarsPath = path.join(repoRoot, ".dev.vars");
const localD1Path = path.join(repoRoot, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const PLACEHOLDER = /xxx|replace-with|example\.com/;

function run(label, command, args) {
  console.log(`\n> ${label}`);
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function createDevVars() {
  if (existsSync(devVarsPath)) {
    console.log(".dev.vars exists; leaving it unchanged.");
    return;
  }
  const lines = readFileSync(path.join(repoRoot, ".dev.vars.example"), "utf8").split("\n").map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) return line;
    const [, key, value] = match;
    if (key === "BETTER_AUTH_SECRET") return `${key}=${randomBytes(24).toString("hex")}`;
    // Optional integrations stay disabled until someone fills in real test values.
    return PLACEHOLDER.test(value) ? `# ${line}` : line;
  });
  writeFileSync(devVarsPath, lines.join("\n"));
  console.log("Created .dev.vars with a generated BETTER_AUTH_SECRET. Optional integrations are commented out.");
}

createDevVars();
run("Validate environment", "node", ["scripts/check-env.mjs"]);

if (existsSync(localD1Path)) {
  run("Apply pending local D1 migrations", "pnpm", ["run", "db:migrate:d1:local"]);
} else {
  run("Create and seed local D1", "node", ["scripts/d1-reset-local.mjs"]);
}

run("Install the Playwright browser (no-op when present)", "pnpm", ["exec", "playwright", "install", "chromium"]);

if (!existsSync(path.join(repoRoot, "dist/index.html"))) {
  run("Build dist/ for the API dev server", "pnpm", ["run", "build:dev"]);
}

console.log(`
Setup complete.
  Start:        pnpm run dev:all   (ports and URLs are printed; logs go to tmp/logs/)
  Sign in:      john@test.com / password123 (see docs/getting-started/quick-reference.md)
  Screenshot:   pnpm run ui:snap -- dashboard --login john@test.com
  Verify:       pnpm run verify
`);
