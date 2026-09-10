import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from 'node:os';
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyOrderedWranglerMigrations } from './data/ordered-wrangler-replay.mjs';
import { applyLocalSeedProfile } from './data/seed-local.ts';

const DATABASE_NAME = "serp-checklists-db";
const NPX_COMMAND = process.platform === "win32" ? "cmd.exe" : "npx";
const NPX_ARGS_PREFIX = process.platform === "win32" ? ["/d", "/s", "/c", "npx"] : [];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const localD1StatePath = path.resolve(
  repoRoot,
  ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
);
const retryableDeleteCodes = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);

if (!localD1StatePath.startsWith(path.join(repoRoot, ".wrangler"))) {
  throw new Error(`Refusing to reset unexpected D1 state path: ${localD1StatePath}`);
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function resetLocalD1State() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      rmSync(localD1StatePath, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = error && typeof error === "object" ? error.code : undefined;
      if (!retryableDeleteCodes.has(code) || attempt === 5) {
        throw new Error(
          `Could not reset local D1 state at ${localD1StatePath}. Stop any running Wrangler/Pages dev process and retry.`,
          { cause: error },
        );
      }
      sleep(250 * attempt);
    }
  }
}

try {
  resetLocalD1State();
  const replayRoot = mkdtempSync(path.join(tmpdir(), 'serplists-reset-replay-'));
  try {
    const migrations = path.join(replayRoot, 'migrations');
    mkdirSync(migrations);
    const config = path.join(replayRoot, 'wrangler.toml');
    writeFileSync(config, readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8').replaceAll('migrations_dir = "db/migrations"', `migrations_dir = ${JSON.stringify(migrations)}`));
    await applyOrderedWranglerMigrations({
      sourceDirectory: path.join(repoRoot, 'db/migrations'),
      ownedDirectory: migrations,
      apply: () => run(NPX_COMMAND, [...NPX_ARGS_PREFIX, 'wrangler', 'd1', 'migrations', 'apply', DATABASE_NAME, '--local', '--config', config, '--persist-to', path.join(repoRoot, '.wrangler/state')]),
    });
  } finally {
    rmSync(replayRoot, { recursive: true, force: true });
  }
  await applyLocalSeedProfile({ persistPath: path.join(repoRoot, '.wrangler/state'), profile: 'all' });
  console.log("Local D1 reset complete");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
