export type SeedStepId = "seed-test" | "repair-test-slugs" | "official-templates" | "official-login";
export interface SeedStatus {
  testData: boolean;
  officialTemplates: boolean;
  officialLogin: boolean;
  legacyTestSlugs: boolean;
}

export type SeedStep = { id: SeedStepId; label: string; tool: "tsx" | "wrangler"; args: string[]; existingDataOnly?: boolean };

export const DATABASE_NAME: string;
export const LOCAL_SEED_STEPS: ReadonlyArray<SeedStep>;
export const RESET_SEED_STEPS: ReadonlyArray<SeedStep>;
export const SEED_STATUS_PREFIX: string;
export function parseSeedStatus(output: string): SeedStatus;
export function missingSeedParts(status: SeedStatus): string[];
export function planSeedSteps(status: SeedStatus): SeedStepId[];
