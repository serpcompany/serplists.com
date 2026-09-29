// The local D1 seed stages, shared by `pnpm run db:reset` (scripts/d1-reset-local.mjs)
// and `pnpm run setup` (scripts/setup-local.mjs), plus the seed status that
// `tsx scripts/data/local-d1-data.ts seed-status` prints (see readLocalSeedStatus in
// db/seeds/local.ts).
import { z } from "zod";

export const DATABASE_NAME = "serp-checklists-db";

/**
 * In run order. Each stage is safe to re-run. A stage with `existingDataOnly` only fixes
 * data an older seed left, so db:reset (which seeds from scratch) skips it.
 */
export const LOCAL_SEED_STEPS = [
  {
    id: "seed-test",
    label: "Seed local test Users, Organizations, Templates and Runs",
    tool: "tsx",
    args: ["scripts/data/local-d1-data.ts", "seed-test"],
  },
  {
    id: "repair-test-slugs",
    label: "Rename test Template slugs that official Templates need",
    tool: "tsx",
    args: ["scripts/data/local-d1-data.ts", "repair-test-slugs"],
    existingDataOnly: true,
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

/** The stages db:reset runs, in order, after creating and migrating local D1. */
export const RESET_SEED_STEPS = LOCAL_SEED_STEPS.filter((step) => !step.existingDataOnly);

export const SEED_STATUS_PREFIX = "LOCAL_SEED_STATUS ";

const seedStatusSchema = z.object({
  testData: z.boolean(),
  officialTemplates: z.boolean(),
  officialLogin: z.boolean(),
  legacyTestSlugs: z.boolean().default(false),
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
 * Test data seeded before the test Templates got sample- slugs holds official Templates'
 * slugs, so it is renamed in place before the official Templates are seeded.
 * The official login needs the SERP User from the official Templates seed.
 */
export function planSeedSteps(status) {
  return [
    ...(status.testData ? [] : ["seed-test"]),
    ...(status.testData && status.legacyTestSlugs ? ["repair-test-slugs"] : []),
    ...(status.officialTemplates ? [] : ["official-templates"]),
    ...(status.officialTemplates && status.officialLogin ? [] : ["official-login"]),
  ];
}
