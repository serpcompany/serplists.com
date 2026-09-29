#!/usr/bin/env node
// One-command, re-runnable local setup for a fresh clone or git worktree:
//   pnpm install && pnpm run setup && pnpm run dev:all
// - creates .dev.vars from .dev.vars.example with a generated auth secret (never overwrites)
// - creates local D1 if this checkout has none, otherwise applies pending migrations,
//   then seeds whatever seed data is missing (never resetting data that is there)
// - installs the Playwright browser used by e2e tests and `pnpm run ui:snap`
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATABASE_NAME, LOCAL_SEED_STEPS, parseSeedStatus } from "./lib/local-d1-seed.mjs";
import { buildToolInvocation } from "./lib/run-tool.mjs";
import { renderDevVars, runLocalD1Setup } from "./setup-local-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devVarsPath = path.join(repoRoot, ".dev.vars");
const localD1Path = path.join(repoRoot, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");

// No shell: tools run as `node <bin script>` (see scripts/lib/run-tool.mjs).
function run(label, { command, args, options = {} }) {
  console.log(`\n> ${label}`);
  execFileSync(command, args, { ...options, cwd: repoRoot, stdio: "inherit" });
}

const nodeScript = (script) => ({ command: process.execPath, args: [script] });

function createDevVars() {
  if (existsSync(devVarsPath)) {
    console.log(".dev.vars exists; leaving it unchanged.");
    return;
  }
  const example = readFileSync(path.join(repoRoot, ".dev.vars.example"), "utf8");
  writeFileSync(devVarsPath, renderDevVars(example, randomBytes(24).toString("hex")));
  console.log("Created .dev.vars with a generated BETTER_AUTH_SECRET. Optional integrations are commented out.");
}

const D1_STEPS = {
  reset: ["Create and seed local D1", nodeScript("scripts/d1-reset-local.mjs")],
  migrate: [
    "Apply pending local D1 migrations",
    buildToolInvocation("wrangler", ["d1", "migrations", "apply", DATABASE_NAME, "--local"]),
  ],
  ...Object.fromEntries(LOCAL_SEED_STEPS.map((step) => [step.id, [step.label, buildToolInvocation(step.tool, step.args)]])),
};

function readSeedStatus() {
  const { command, args, options } = buildToolInvocation("tsx", ["scripts/data/local-d1-data.ts", "seed-status"]);
  try {
    const output = execFileSync(command, args, { ...options, cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    return parseSeedStatus(output);
  } catch (error) {
    throw new Error(
      `Could not read the local D1 seed status. If dev:all is running, stop it with \`pnpm run dev:stop\` and re-run setup. ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

createDevVars();
run("Validate environment", nodeScript("scripts/check-env.mjs"));

try {
  runLocalD1Setup({
    stateDirExists: existsSync(localD1Path),
    run: (step) => run(...D1_STEPS[step]),
    readSeedStatus,
  });
} catch (error) {
  console.error(`\nSetup stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

run("Install the Playwright browser (no-op when present)", buildToolInvocation("playwright", ["install", "chromium"]));

console.log(`
Setup complete.
  Start:        pnpm run dev:all   (the URL is printed; logs go to tmp/logs/dev-all.log)
  Sign in:      john@test.com / password123 (see docs/design-docs/development-environment.md)
  Screenshot:   pnpm run ui:snap -- dashboard --login john@test.com
  Verify:       pnpm run verify
`);
