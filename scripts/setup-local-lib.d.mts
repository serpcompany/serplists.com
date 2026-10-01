import type { SeedStatus, SeedStepId } from "./lib/local-d1-seed.mjs";

export type LocalD1SetupStep = "migrate" | "reset" | SeedStepId;

export function renderDevVars(exampleText: string, secret: string): string;
export function runLocalD1Setup(options: {
  stateDirExists: boolean;
  run: (step: LocalD1SetupStep) => void;
  readSeedStatus: () => SeedStatus;
}): SeedStatus;
