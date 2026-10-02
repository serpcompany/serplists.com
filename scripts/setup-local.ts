import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATABASE_NAME, LOCAL_SEED_STEPS, parseSeedStatus, seedStepInvocation } from "./lib/local-d1-seed";
import { buildScriptInvocation, buildToolInvocation, type Invocation } from "./lib/run-tool";
import { type LocalD1SetupStep, renderDevVars, runLocalD1Setup } from "./setup-local-lib";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const devVarsPath = path.join(repoRoot, ".dev.vars");
const localD1Path = path.join(repoRoot, ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");

function run(label: string, { command, args, options }: Invocation) {
  console.log(`\n> ${label}`);
  execFileSync(command, args, { ...options, cwd: repoRoot, stdio: "inherit" });
}

function createDevVars() {
  if (existsSync(devVarsPath)) {
    console.log(".dev.vars exists; leaving it unchanged.");
    return;
  }
  const example = readFileSync(path.join(repoRoot, ".dev.vars.example"), "utf8");
  writeFileSync(devVarsPath, renderDevVars(example, randomBytes(24).toString("hex")));
  console.log("Created .dev.vars with a generated BETTER_AUTH_SECRET. Optional integrations are commented out.");
}

function runD1Step(step: LocalD1SetupStep) {
  if (step === "reset") {
    run("Create and seed local D1", buildScriptInvocation("scripts/d1-reset-local.ts"));
    return;
  }
  if (step === "migrate") {
    run("Apply pending local D1 migrations", buildToolInvocation("wrangler", ["d1", "migrations", "apply", DATABASE_NAME, "--local"]));
    return;
  }
  const seedStep = LOCAL_SEED_STEPS.find((candidate) => candidate.id === step);
  if (!seedStep) throw new Error(`No local seed step is called ${step}.`);
  run(seedStep.label, seedStepInvocation(seedStep));
}

function readSeedStatus() {
  const { command, args, options } = buildScriptInvocation("scripts/data/local-d1-data.ts", ["seed-status"]);
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
run("Validate environment", buildScriptInvocation("scripts/check-env.ts"));

try {
  runLocalD1Setup({
    stateDirExists: existsSync(localD1Path),
    run: runD1Step,
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
