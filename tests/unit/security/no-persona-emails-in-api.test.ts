import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { DEV_TEST_USERS } from "@/lib/auth/devUsers";

const functionsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../functions");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(ts|js|mjs)$/.test(entry.name) ? [entryPath] : [];
  });
}

describe("API code and seeded persona emails, which anyone can register outside local development", () => {
  it("never mentions a seeded persona email, so it grants nothing by address", () => {
    const files = sourceFiles(functionsDir);
    expect(files.length).toBeGreaterThan(0);

    const mentions = files.flatMap((file) => {
      const source = readFileSync(file, "utf8").toLowerCase();
      return DEV_TEST_USERS.filter((user) => source.includes(user.email.toLowerCase())).map(
        (user) => `${path.relative(functionsDir, file)}: ${user.email}`,
      );
    });

    expect(mentions).toEqual([]);
  });
});
