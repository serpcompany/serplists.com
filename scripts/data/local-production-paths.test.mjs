import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scripts = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).scripts;

describe("local production mutation guard", () => {
  it.each([
    "db:migrations:baseline:prod",
    "db:migrate:d1:prod",
    "db:cleanup:remote",
    "db:seed:official:remote",
    "auth:reset:official:serp",
    "billing:set:official:serp",
    "db:migrate",
  ])("routes %s to the blocking guard instead of Wrangler", (name) => {
    expect(scripts[name]).toContain("production-path-blocked.mjs");
    expect(scripts[name]).not.toContain("wrangler");
  });
});
