import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../../fixtures/sqliteD1";

const officialSeedSql = readFileSync(path.join("db", "seeds", "official-templates.sql"), "utf8");

const LITERAL_BACKSLASH_N = `${String.fromCharCode(92)}n`;

type OfficialRow = { id: string; items: string };

function officialRowsAsSqliteStoresTheSeed(): OfficialRow[] {
  const sqlite = createMigratedD1().sqlite;
  sqlite.exec(officialSeedSql);
  return sqlite
    .prepare("SELECT id, items FROM templates WHERE user_id = 'serp-user' ORDER BY id")
    .all() as unknown as OfficialRow[];
}

function collectStrings(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") {
    found.push(value);
  } else if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, found);
  } else if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, found);
  }
  return found;
}

type Section = { items: Array<{ id: string; contents?: Array<{ type: string; value: string }> }> };

const rows = officialRowsAsSqliteStoresTheSeed();

describe("official Template seed", () => {
  it("stores items that parse to non-empty sections", () => {
    expect(rows.map((row) => row.id)).toContain("serp-template-technical-seo-audit");
    for (const row of rows) {
      const sections = JSON.parse(row.items) as Section[];
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
    }
  });

  it("stores line breaks, not the literal backslash followed by n that a doubled escape stores, since SQLite reads no escapes in string literals", () => {
    const offenders = rows.flatMap((row) =>
      collectStrings(JSON.parse(row.items))
        .filter((text) => text.includes(LITERAL_BACKSLASH_N))
        .map((text) => `${row.id}: ${text.slice(0, 60)}`),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps multi-line text blocks on separate lines", () => {
    const audit = rows.find((row) => row.id === "serp-template-technical-seo-audit");
    const sections = JSON.parse(audit?.items ?? "[]") as Section[];
    const robots = sections.flatMap((section) => section.items).find((item) => item.id === "t-1");
    const text = robots?.contents?.find((content) => content.type === "text")?.value ?? "";

    expect(text.split("\n")).toEqual([
      "- Verify `robots.txt` returns `200` and is reachable.",
      "- Confirm important paths are not disallowed.",
      "- Spot check a few key pages for `meta robots` (noindex/nofollow).",
      "",
      "Useful: https://developers.google.com/search/docs/crawling-indexing/robots/intro",
    ]);
  });
});
