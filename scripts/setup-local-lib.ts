import { normalizeEol } from "./lib/line-endings";
import { missingSeedParts, planSeedSteps, type SeedStatus, type SeedStepId } from "./lib/local-d1-seed";

export type LocalD1SetupStep = "migrate" | "reset" | SeedStepId;

const PLACEHOLDER = /xxx|replace-with|example\.com/;

export function renderDevVars(exampleText: string, secret: string): string {
  return normalizeEol(exampleText)
    .split("\n")
    .map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) return line;
      const [, key, value = ""] = match;
      if (key === "BETTER_AUTH_SECRET") return `${key}=${secret}`;
      return PLACEHOLDER.test(value) ? `# ${line}` : line;
    })
    .join("\n");
}

const SEED_RECOVERY_HINT =
  "If one of your own Templates uses an official Template's slug, change that slug and run setup again. " +
  "Otherwise `pnpm run db:seed` seeds the test data again (this deletes what the test Users made), " +
  "or `pnpm run db:reset` rebuilds local D1 (this deletes local data).";

function runSeedStep(run: (step: LocalD1SetupStep) => void, step: SeedStepId): void {
  try {
    run(step);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Seed stage ${step} failed: ${reason}\n${SEED_RECOVERY_HINT}`, { cause: error });
  }
}

export function runLocalD1Setup({
  stateDirExists,
  run,
  readSeedStatus,
}: {
  stateDirExists: boolean;
  run: (step: LocalD1SetupStep) => void;
  readSeedStatus: () => SeedStatus;
}): SeedStatus {
  if (stateDirExists) {
    run("migrate");
    for (const step of planSeedSteps(readSeedStatus())) runSeedStep(run, step);
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
