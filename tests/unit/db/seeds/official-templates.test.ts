import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrationsDir = path.join("db", "migrations");
const officialSeedSql = readFileSync(path.join("db", "seeds", "official-templates.sql"), "utf8");

// A backslash followed by "n": what a line break becomes when the SQL seed
// escapes it twice. SQLite does not process backslash escapes in string
// literals, so the stored JSON would decode to these two characters.
const LITERAL_BACKSLASH_N = `${String.fromCharCode(92)}n`;

type OfficialRow = { id: string; items: string };

// Run the seed against real SQLite with every migration applied, so the test
// sees exactly what SQLite stores for the seed's string literals.
function seededOfficialRows(): OfficialRow[] {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
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

const rows = seededOfficialRows();

describe("official Template seed", () => {
  it("stores items that parse to non-empty sections", () => {
    expect(rows.map((row) => row.id)).toContain("serp-template-technical-seo-audit");
    for (const row of rows) {
      const sections = JSON.parse(row.items) as Section[];
      expect(Array.isArray(sections)).toBe(true);
      expect(sections.length).toBeGreaterThan(0);
    }
  });

  it("stores line breaks, not a literal backslash followed by n", () => {
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
