// Pure helpers for scripts/setup-local.mjs, kept apart so they can be unit tested.
import { normalizeEol } from "./lib/line-endings.mjs";
import { missingSeedParts, planSeedSteps } from "./lib/local-d1-seed.mjs";

const PLACEHOLDER = /xxx|replace-with|example\.com/;

/**
 * .dev.vars text built from .dev.vars.example: BETTER_AUTH_SECRET gets `secret`, and
 * any other value that is still a placeholder is commented out so optional
 * integrations stay disabled until someone fills in real test values. The example is
 * read with LF line endings, so a CRLF checkout still gets a generated secret.
 */
export function renderDevVars(exampleText, secret) {
  return normalizeEol(exampleText)
    .split("\n")
    .map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) return line;
      const [, key, value] = match;
      if (key === "BETTER_AUTH_SECRET") return `${key}=${secret}`;
      return PLACEHOLDER.test(value) ? `# ${line}` : line;
    })
    .join("\n");
}

/**
 * Brings local D1 to a migrated, fully seeded state and returns the seed status.
 * The decision comes from what the database holds, not from whether its directory
 * exists: a seed that failed or was interrupted, or a database dev:api created, is
 * seeded on the next run. An existing database is never reset, and only missing seed
 * stages run. Throws when seed data is still missing, so setup never reports success
 * (or the john@test.com sign-in) for a database without it.
 *
 * `run(step)` runs "reset" (create, migrate and seed from scratch), "migrate", or a
 * seed step from LOCAL_SEED_STEPS; `readSeedStatus()` reads the seed status.
 */
export function runLocalD1Setup({ stateDirExists, run, readSeedStatus }) {
  if (stateDirExists) {
    run("migrate");
    for (const step of planSeedSteps(readSeedStatus())) run(step);
  } else {
    run("reset");
  }
  const status = readSeedStatus();
  const missing = missingSeedParts(status);
  if (missing.length > 0) {
    throw new Error(`Local D1 is still missing ${missing.join(", ")}. Run \`pnpm run db:reset\` to rebuild it (this deletes local data).`);
  }
  return status;
}
