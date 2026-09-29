export const DEFAULT_E2E_PORT: number;
export const SMOKE_PERSIST_PATH: string;
export const E2E_AUTH_SECRET: string;

type Env = Record<string, string | undefined>;

export function resolveAppUrl(env: Env): string;
export function needsOpenPort(processEnv: Env): boolean;
export function assertSmokePersistPath(persistPath: string, repoRoot: string): string;
export function resolveSmokeEnv(
  processEnv: Env,
  options: { openPort?: number | null; repoRoot: string },
): { env: Env; seedPath: string | null; notes: string[] };
export function buildPreviewArgs(env: Env): string[];
