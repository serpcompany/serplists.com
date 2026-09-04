import { execFileSync } from "node:child_process";
import {
  assertOfficialSerpPlanInspectResults,
  buildOfficialSerpPlanInspectSql,
  buildOfficialSerpPlanSql,
  validatePlan,
} from "./set-official-serp-plan-lib.mjs";
import { OFFICIAL_SERP_EMAIL } from "./reset-official-serp-password-lib.mjs";

const DATABASE_NAME = process.env.D1_DATABASE_NAME ?? "serp-checklists-db";
const PLAN_ENV_NAME = "SERP_PLAN";

function parseArgs(argv) {
  const args = new Set(argv);

  return {
    execute: args.has("--execute"),
    json: args.has("--json"),
  };
}

function runWranglerCommand(sql) {
  try {
    const stdout = execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        DATABASE_NAME,
        "--remote",
        "--json",
        "--command",
        sql,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1024 * 1024 * 10,
      },
    );

    return JSON.parse(stdout);
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr || "").trim()
      : "";
    const stdout = error && typeof error === "object" && "stdout" in error
      ? String(error.stdout || "").trim()
      : "";
    const details = stderr || stdout || (error instanceof Error ? error.message : String(error));
    throw new Error(`Wrangler D1 execute failed: ${details}`);
  }
}

function printUsage() {
  console.log(`Usage:
  ${PLAN_ENV_NAME}=pro node scripts/set-official-serp-plan.mjs --execute

Options:
  --execute   Apply the live plan override for ${OFFICIAL_SERP_EMAIL}
  --json      Print a compact JSON summary after inspection or update

Notes:
  - This script is hard-scoped to the official live publisher account only.
  - Without --execute, the script only performs a live read-only inspection.`);
}

function printSummary(summary, asJson) {
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`official publisher: ${summary.email} (${summary.username})`);
  console.log(`override plan: ${summary.overridePlan ?? "none"}`);
  console.log(`override note: ${summary.overrideNote ?? "none"}`);
  console.log(`override updated_at: ${summary.overrideUpdatedAt ?? "none"}`);
}

function toSummary(state) {
  return {
    email: state.userRow.email,
    username: state.userRow.username,
    overridePlan: state.overrideRow?.plan ?? null,
    overrideNote: state.overrideRow?.note ?? null,
    overrideUpdatedAt: state.overrideRow?.updated_at ?? null,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.execute) {
    throw new Error("Production entitlement mutation is blocked outside the protected workflow and approved break-glass procedure.");
  }

  const beforeResults = runWranglerCommand(buildOfficialSerpPlanInspectSql());
  const beforeState = assertOfficialSerpPlanInspectResults(beforeResults);

  if (!options.execute) {
    printSummary(toSummary(beforeState), options.json);
    return;
  }

  const desiredPlan = process.env[PLAN_ENV_NAME];
  const validation = validatePlan(desiredPlan);
  if (!validation.ok) {
    throw new Error(`${PLAN_ENV_NAME} invalid: ${validation.message}`);
  }

  runWranglerCommand(
    buildOfficialSerpPlanSql({
      plan: validation.normalizedPlan,
      nowIso: new Date().toISOString(),
    }),
  );

  const afterResults = runWranglerCommand(buildOfficialSerpPlanInspectSql());
  const afterState = assertOfficialSerpPlanInspectResults(afterResults);
  const summary = toSummary(afterState);

  if (summary.overridePlan !== validation.normalizedPlan) {
    throw new Error(`Plan update completed but override plan is ${summary.overridePlan ?? "null"}.`);
  }

  printSummary(summary, options.json);
}

main();
