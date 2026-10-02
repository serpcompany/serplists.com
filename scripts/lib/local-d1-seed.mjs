import { z } from "zod";

export const DATABASE_NAME = "serp-checklists-db";

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

export const RESET_SEED_STEPS = LOCAL_SEED_STEPS.filter((step) => !step.existingDataOnly);

export const SEED_STATUS_PREFIX = "LOCAL_SEED_STATUS ";

const seedStatusSchema = z.object({
  testData: z.boolean(),
  officialTemplates: z.boolean(),
  officialLogin: z.boolean(),
  legacyTestSlugs: z.boolean().default(false),
});

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

export function planSeedSteps(status) {
  return [
    ...(status.testData ? [] : ["seed-test"]),
    ...(status.testData && status.legacyTestSlugs ? ["repair-test-slugs"] : []),
    ...(status.officialTemplates ? [] : ["official-templates"]),
    ...(status.officialTemplates && status.officialLogin ? [] : ["official-login"]),
  ];
}
