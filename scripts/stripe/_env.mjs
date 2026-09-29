import { readFileSync, existsSync, writeFileSync } from "node:fs";

export function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const contents = readFileSync(path, "utf8");
  const entries = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    entries[key] = value;
  }
  return entries;
}

export function loadLocalEnv() {
  const fileEnv = {
    ...parseEnvFile(".env"),
    ...parseEnvFile(".env.local"),
    ...parseEnvFile(".dev.vars"),
  };
  // Explicit process injection must win over local defaults. This is required
  // for one-off administrative commands that receive credentials from a
  // secret manager rather than from a repository-adjacent file.
  return { ...fileEnv, ...process.env };
}

/** Where local Stripe scripts look for the test secret key, for error messages. */
export const TEST_SECRET_KEY_HINT =
  "Set STRIPE_SECRET_KEY=sk_test_... (or STRIPE_TEST_SECRET_KEY) in .dev.vars.";

/**
 * The Stripe test secret key for local scripts: STRIPE_TEST_SECRET_KEY, then its
 * alias STRIPE_SECRET_KEY_TEST, then STRIPE_SECRET_KEY, the name .dev.vars.example
 * uses. An empty dedicated key counts as unset. Only an sk_test_ value is returned:
 * a live key never resolves, even one exported in the shell (process.env wins over
 * .dev.vars), and a dedicated key that is not a test key is not hidden by falling
 * back to STRIPE_SECRET_KEY.
 */
export function resolveTestSecretKey(env) {
  const dedicated = [env.STRIPE_TEST_SECRET_KEY, env.STRIPE_SECRET_KEY_TEST]
    .map((value) => value?.trim())
    .find(Boolean);
  const key = dedicated ?? env.STRIPE_SECRET_KEY?.trim();
  return key?.startsWith("sk_test_") ? key : undefined;
}

export function updateEnvFile(path, updates) {
  const contents = existsSync(path) ? readFileSync(path, "utf8") : "";
  const remaining = new Map(Object.entries(updates));
  const lines = contents.split("\n").map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !remaining.has(match[1])) return line;
    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}=${value}`;
  });

  if (lines.at(-1) === "") lines.pop();
  for (const [key, value] of remaining) lines.push(`${key}=${value}`);
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
}

export function removeEnvKeys(path, keys) {
  if (!existsSync(path)) return;
  const blocked = new Set(keys);
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
      return !match || !blocked.has(match[1]);
    });
  if (lines.at(-1) === "") lines.pop();
  writeFileSync(path, `${lines.join("\n")}\n`, { mode: 0o600 });
}
