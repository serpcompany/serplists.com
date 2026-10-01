type EnvValues = Readonly<Record<string, string | undefined>>;

export const TEST_SECRET_KEY_HINT: string;

export function loadLocalEnv(): Record<string, string | undefined>;
export function resolveTestSecretKey(env: EnvValues): string | undefined;
export function resolveLiveSecretKey(env: EnvValues): string | undefined;
export function stripeSecretKeyIsLive(env: EnvValues): boolean;
export function updateEnvFile(path: string, updates: Readonly<Record<string, string>>): void;
export function removeEnvKeys(path: string, keys: Iterable<string>): void;
