import { readFileSync, existsSync } from "node:fs";

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
  return { ...process.env, ...fileEnv };
}

