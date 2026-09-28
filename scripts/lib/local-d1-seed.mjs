// The local D1 seed stages, shared by `pnpm run db:reset` (scripts/d1-reset-local.mjs)
// and `pnpm run setup` (scripts/setup-local.mjs), plus the seed status that
// `tsx scripts/data/local-d1-data.ts seed-status` prints (see readLocalSeedStatus in
// db/seeds/local.ts).
import { z } from "zod";

export const DATABASE_NAME = "serp-checklists-db";

/** In run order. Each stage is safe to re-run. */
export const LOCAL_SEED_STEPS = [
  {
    id: "seed-test",
    label: "Seed local test Users, Organizations, Templates and Runs",
    tool: "tsx",
    args: ["scripts/data/local-d1-data.ts", "seed-test"],
  },
  {
    id: "official-templates",
    label: "Seed official Templates",
    tool: "wrangler",
    args: ["d1", "execute", DATABASE_NAME, "--local", "--file", "./db/seeds/official-templates.sql"],
  },
  {
    id: "official-login",
    label: "Seed the official SERP login",
    tool: "tsx",
    args: ["scripts/data/local-d1-data.ts", "seed-official-login"],
  },
];

export const SEED_STATUS_PREFIX = "LOCAL_SEED_STATUS ";

const seedStatusSchema = z.object({
  testData: z.boolean(),
  officialTemplates: z.boolean(),
  officialLogin: z.boolean(),
});

/** The status from `local-d1-data.ts seed-status` output (Wrangler may log around it). */
export function parseSeedStatus(output) {
  const line = output
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(SEED_STATUS_PREFIX));
  if (!line) throw new Error("local-d1-data.ts seed-status printed no status line");
  return seedStatusSchema.parse(JSON.parse(line.slice(SEED_STATUS_PREFIX.length)));
}

export function missingSeedParts(status) {
  return [
    ...(status.testData ? [] : ["test data (john@test.com and the other test Users)"]),
    ...(status.officialTemplates ? [] : ["official Templates"]),
    ...(status.officialLogin ? [] : ["the official SERP login"]),
  ];
}

/**
 * The seed stages to run for a migrated database: only the missing ones, so data that
 * is already there is never reset (seed-test starts by deleting the test Users' data).
 * The official login needs the SERP User from the official Templates seed.
 */
export function planSeedSteps(status) {
  return [
    ...(status.testData ? [] : ["seed-test"]),
    ...(status.officialTemplates ? [] : ["official-templates"]),
    ...(status.officialTemplates && status.officialLogin ? [] : ["official-login"]),
  ];
}
