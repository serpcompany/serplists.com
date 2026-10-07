import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { parseEnvFile } from "../lib/env-file";

type EnvValues = Readonly<Record<string, string | undefined>>;

export function loadLocalEnv(): Record<string, string | undefined> {
  const fileEnv = {
    ...parseEnvFile(".env"),
    ...parseEnvFile(".env.local"),
    ...parseEnvFile(".dev.vars"),
  };
  return { ...fileEnv, ...process.env };
}

export const TEST_SECRET_KEY_HINT =
  "Set STRIPE_SECRET_KEY=sk_test_... (or STRIPE_TEST_SECRET_KEY) in .dev.vars.";

export function resolveTestSecretKey(env: EnvValues): string | undefined {
  const dedicated = [env["STRIPE_TEST_SECRET_KEY"], env["STRIPE_SECRET_KEY_TEST"]]
    .map((value) => value?.trim())
    .find(Boolean);
  const key = dedicated ?? env["STRIPE_SECRET_KEY"]?.trim();
  return key?.startsWith("sk_test_") ? key : undefined;
}

export function resolveLiveSecretKey(env: EnvValues): string | undefined {
  return env["STRIPE_LIVE_SECRET_KEY"] ??
    env["STRIPE_SECRET_KEY_LIVE"] ??
    (stripeSecretKeyIsLive(env) ? env["STRIPE_SECRET_KEY"] : undefined);
}

export function stripeSecretKeyIsLive(env: EnvValues): boolean {
  return env["STRIPE_SECRET_KEY"]?.startsWith("sk_live_") ?? false;
}

export function updateEnvFile(path: string, updates: Readonly<Record<string, string>>): void {
  const contents = existsSync(path) ? readFileSync(path, "utf8") : "";
  const remaining = new Map(Object.entries(updates));
  const lines = contents.split("\n").map((line) => {
    const name = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1];
    const value = name === undefined ? undefined : remaining.get(name);
    if (name === undefined || value === undefined) return line;
    remaining.delete(name);
    return `${name}=${value}`;
  });

  if (lines.at(-1) === "") lines.pop();
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
}

export function removeEnvKeys(path: string, keys: Iterable<string>): void {
  if (!existsSync(path)) return;
  const blocked = new Set(keys);
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => {
      const name = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1];
      return name === undefined || !blocked.has(name);
    });
  if (lines.at(-1) === "") lines.pop();
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
}
