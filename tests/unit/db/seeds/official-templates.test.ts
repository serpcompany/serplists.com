import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pathsOfLiteralBackslashN } from "../../../support/literalBackslashN";
import { SqliteD1 } from "../../../support/sqlite-d1";

const officialSeedSql = readFileSync(path.join("db", "seeds", "official-templates.sql"), "utf8");

const JSON_COLUMNS = ["items", "category", "tags"] as const;

type OfficialRow = Record<(typeof JSON_COLUMNS)[number] | "id", string>;

function officialRowsAsSqliteStoresTheSeed(): OfficialRow[] {
  const database = new SqliteD1();
  database.sqlite.exec(officialSeedSql);
  return database.rows<OfficialRow>(
    "SELECT id, items, category, tags FROM templates WHERE user_id = 'serp-user' ORDER BY id",
  );
}

type Section = { items: Array<{ id: string; contents?: Array<{ type: string; value: string }> }> };

const rows = officialRowsAsSqliteStoresTheSeed();

describe("official Template seed", () => {
  it("stores items that parse to non-empty sections", () => {
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.map((row) => row.id)).toContain("serp-template-technical-seo-audit");
    for (const row of rows) {
      const sections = JSON.parse(row.items) as Section[];
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
    }
  });

  it("stores line breaks, not the literal backslash followed by n that a doubled escape stores, since SQLite reads no escapes in string literals", () => {
    const offenders = rows.flatMap((row) =>
      JSON_COLUMNS.flatMap((column) => pathsOfLiteralBackslashN(JSON.parse(row[column]), `${row.id}.${column}`)),
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
