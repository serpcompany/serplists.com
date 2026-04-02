import { execFileSync } from "node:child_process";
import bcrypt from "bcryptjs";
import {
  OFFICIAL_SERP_EMAIL,
  buildOfficialSerpInspectSql,
  buildOfficialSerpResetSql,
  assertOfficialSerpInspectResults,
  validateOfficialPassword,
} from "./reset-official-serp-password-lib.mjs";

const DATABASE_NAME = process.env.D1_DATABASE_NAME ?? "serp-checklists-db";
const PASSWORD_ENV_NAME = "SERP_RESET_PASSWORD";

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
  ${PASSWORD_ENV_NAME}="a-strong-password" node scripts/reset-official-serp-password.mjs --execute

Options:
  --execute   Apply the live password reset for ${OFFICIAL_SERP_EMAIL}
  --json      Print a compact JSON summary after inspection or reset

Notes:
  - This script is hard-scoped to the official live publisher account only.
  - It updates both users.password_hash and account.password, marks email verified,
    and clears existing sessions.
  - Without --execute, the script only performs a live read-only inspection.`);
}

function printSummary(summary, asJson) {
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`official publisher: ${summary.email} (${summary.username})`);
  console.log(`email_verified: ${summary.emailVerified}`);
  console.log(`credential account: ${summary.hasCredentialAccount ? "present" : "missing"}`);
  console.log(`password hash length: ${summary.passwordLength}`);
  console.log(`active sessions: ${summary.sessionCount}`);
  console.log(`auth_updated_at: ${summary.authUpdatedAt}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const beforeResults = runWranglerCommand(buildOfficialSerpInspectSql());
  const beforeState = assertOfficialSerpInspectResults(beforeResults);

  if (!options.execute) {
    printSummary(
      {
        email: beforeState.userRow.email,
        username: beforeState.userRow.username,
        emailVerified: Number(beforeState.userRow.email_verified) === 1,
        hasCredentialAccount: true,
        passwordLength: Number(beforeState.userRow.password_len ?? 0),
        sessionCount: beforeState.sessionCount,
        authUpdatedAt: Number(beforeState.userRow.auth_updated_at ?? 0),
      },
      options.json,
    );
    return;
  }

  const candidatePassword = process.env[PASSWORD_ENV_NAME];
  const validation = validateOfficialPassword(candidatePassword);
  if (!validation.ok) {
    throw new Error(`${PASSWORD_ENV_NAME} invalid: ${validation.message}`);
  }

  const nowMs = Date.now();
  const passwordHash = await bcrypt.hash(validation.normalizedPassword, 10);

  runWranglerCommand(
    buildOfficialSerpResetSql({
      passwordHash,
      nowMs,
    }),
  );

  const afterResults = runWranglerCommand(buildOfficialSerpInspectSql());
  const afterState = assertOfficialSerpInspectResults(afterResults);

  const summary = {
    email: afterState.userRow.email,
    username: afterState.userRow.username,
    emailVerified: Number(afterState.userRow.email_verified) === 1,
    hasCredentialAccount: true,
    passwordLength: Number(afterState.userRow.password_len ?? 0),
    sessionCount: afterState.sessionCount,
    authUpdatedAt: Number(afterState.userRow.auth_updated_at ?? 0),
    resetAppliedAt: nowMs,
  };

  if (!summary.emailVerified) {
    throw new Error("Reset completed but email_verified is still false.");
  }
  if (summary.passwordLength < 60) {
    throw new Error("Reset completed but the stored credential hash looks invalid.");
  }

  printSummary(summary, options.json);

  if (!options.json) {
    console.log("");
    console.log(`Next step: sign in on https://serplists.com/login with ${OFFICIAL_SERP_EMAIL} and the new password to verify the live flow.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
});
