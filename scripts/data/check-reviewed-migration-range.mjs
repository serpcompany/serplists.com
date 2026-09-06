#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { resolveRemoteD1Identity } from "./wrangler-identity-lib.mjs";
import { normalizeMigrationRange, migrationsInRange } from "./migration-range-lib.mjs";
const mode = process.argv[2];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let stage = 'mode';
try {
  if (mode !== 'before' && mode !== 'after') throw new Error('Unsupported reviewed-range mode.');
  stage = 'range-configuration';
  const files = readdirSync(new URL("../../db/migrations/", import.meta.url)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  const from = process.env.MIGRATION_FROM;
  const to = process.env.MIGRATION_TO;
  const expected = migrationsInRange(files, normalizeMigrationRange({ from, to }));
  const childEnv = sanitizedGitEnvironment();
  const assertIdentity = () => {
    const identity = resolveRemoteD1Identity(process.env.DATABASE_NAME, { repoRoot, env: childEnv });
    if (identity.databaseName !== process.env.DATABASE_NAME || identity.databaseId !== process.env.DATABASE_ID) throw new Error("Rehearsal database identity changed during reviewed-range verification.");
  };
  stage = 'identity-before';
  assertIdentity();
  stage = 'pending-list';
  const output = execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", "d1", "migrations", "list", process.env.DATABASE_NAME, "--remote"], { cwd: repoRoot, encoding: "utf8", env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  stage = 'identity-after';
  assertIdentity();
  stage = 'pending-parse';
  const pending = parsePendingMigrationNames(output, files);
  stage = 'reviewed-range';
  if (mode === "before" && JSON.stringify(pending) !== JSON.stringify(expected)) throw new Error("Live pending migrations differ from reviewed range.");
  if (mode === "after" && pending.length) throw new Error("Migration ledger is not clean after apply.");
  stage = 'reporting';
  console.log(`PASS ${mode} reviewed migration ledger.`);
} catch (error) {
  // Both provider transports (including nested identity calls) capture their
  // streams. Never publish Error.message/code, which may embed commands,
  // paths, arguments, or private provider diagnostics.
  const status = Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255 ? error.status : 'unavailable';
  console.error(`BLOCKED reviewed migration ledger; stage: ${stage}; code: reviewed-range-failed; status: ${status}.`);
  process.exit(1);
}
