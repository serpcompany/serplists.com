import { z } from "zod";
import { buildScriptInvocation, buildToolInvocation, type Invocation } from "./run-tool";

export const DATABASE_NAME = "serp-checklists-db";

export type SeedStepId = "seed-test" | "repair-test-slugs" | "official-templates" | "official-login";
export interface SeedStatus {
  testData: boolean;
  officialTemplates: boolean;
  officialLogin: boolean;
  legacyTestSlugs: boolean;
}

type SeedCommand = { script: string } | { tool: "wrangler" };
export type SeedStep = { id: SeedStepId; label: string; command: SeedCommand; args: string[]; existingDataOnly?: boolean };

const LOCAL_D1_DATA_SCRIPT = { script: "scripts/data/local-d1-data.ts" };

export const LOCAL_SEED_STEPS: ReadonlyArray<SeedStep> = [
  {
    id: "seed-test",
    label: "Seed local test Users, Organizations, Templates and Runs",
    command: LOCAL_D1_DATA_SCRIPT,
    args: ["seed-test"],
  },
  {
    id: "repair-test-slugs",
    label: "Rename test Template slugs that official Templates need",
    command: LOCAL_D1_DATA_SCRIPT,
    args: ["repair-test-slugs"],
    existingDataOnly: true,
  },
  {
    id: "official-templates",
    label: "Seed official Templates",
    command: { tool: "wrangler" },
    args: ["d1", "execute", DATABASE_NAME, "--local", "--file", "./db/seeds/official-templates.sql"],
  },
  {
    id: "official-login",
    label: "Seed the official SERP login",
    command: LOCAL_D1_DATA_SCRIPT,
    args: ["seed-official-login"],
  },
];

export const RESET_SEED_STEPS: ReadonlyArray<SeedStep> = LOCAL_SEED_STEPS.filter((step) => !step.existingDataOnly);

export function seedStepInvocation(step: SeedStep, extraArgs: readonly string[] = []): Invocation {
  const args = [...step.args, ...extraArgs];
  return "script" in step.command
    ? buildScriptInvocation(step.command.script, args)
    : buildToolInvocation(step.command.tool, args);
}

export const SEED_STATUS_PREFIX = "LOCAL_SEED_STATUS ";

const seedStatusSchema = z.object({
  testData: z.boolean(),
  officialTemplates: z.boolean(),
  officialLogin: z.boolean(),
  legacyTestSlugs: z.boolean().default(false),
});

export function parseSeedStatus(output: string): SeedStatus {
  const line = output
    .split(/\r?\n/)
    .reverse()
    .find((candidate) => candidate.startsWith(SEED_STATUS_PREFIX));
  if (!line) throw new Error("local-d1-data.ts seed-status printed no status line");
  return seedStatusSchema.parse(JSON.parse(line.slice(SEED_STATUS_PREFIX.length)));
}

export function missingSeedParts(status: SeedStatus): string[] {
  return [
    ...(status.testData ? [] : ["test data (john@test.com and the other test Users)"]),
    ...(status.officialTemplates ? [] : ["official Templates"]),
    ...(status.officialLogin ? [] : ["the official SERP login"]),
  ];
}

const stepWhen = (needed: boolean, step: SeedStepId): SeedStepId[] => (needed ? [step] : []);

export function planSeedSteps(status: SeedStatus): SeedStepId[] {
  return [
    ...stepWhen(!status.testData, "seed-test"),
    ...stepWhen(status.testData && status.legacyTestSlugs, "repair-test-slugs"),
    ...stepWhen(!status.officialTemplates, "official-templates"),
    ...stepWhen(!(status.officialTemplates && status.officialLogin), "official-login"),
  ];
}
