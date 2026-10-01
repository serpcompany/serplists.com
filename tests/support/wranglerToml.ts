import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

const wranglerTomlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../wrangler.toml");

export function varFromWranglerToml(section: string, name: string): string {
  const toml = readFileSync(wranglerTomlPath, "utf8");
  const start = toml.indexOf(`[${section}]`);
  expect(start, `wrangler.toml has no [${section}]`).toBeGreaterThanOrEqual(0);
  const body = toml.slice(start).split(/\n\[/, 2)[0] ?? "";
  const match = body.match(new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m"));
  expect(match, `[${section}] sets ${name}`).not.toBeNull();
  return match?.[1] ?? "";
}
