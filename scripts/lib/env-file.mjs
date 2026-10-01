import { existsSync, readFileSync } from "node:fs";

const SURROUNDING_QUOTE = /^['"]|['"]$/g;

export function parseEnvText(contents) {
  const entries = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    entries[key] = trimmed.slice(separatorIndex + 1).trim().replace(SURROUNDING_QUOTE, "");
  }
  return entries;
}

export function parseEnvFile(filePath) {
  return existsSync(filePath) ? parseEnvText(readFileSync(filePath, "utf8")) : {};
}
