import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import { seedLocalTestData, TEST_TEMPLATE_IDS } from "../../../../db/seeds/local";
import * as schema from "../../../../db/schema/index";
import type { LocalDb } from "../../../../scripts/data/local-d1";

const migrationsDir = path.join("db", "migrations");
const officialSeedSql = readFileSync(path.join("db", "seeds", "official-templates.sql"), "utf8");

type TemplateRow = { id: string; user_id: string; slug: string | null };

// A local database with every migration applied, driven through Drizzle the way
// the seed scripts drive local D1.
function createMigratedDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  const db = drizzle(
    async (sql, params, method) => {
      const statement = sqlite.prepare(sql);
      if (method === "run") {
        statement.run(...params);
        return { rows: [] };
      }
      const rows = statement.all(...params).map((row) => Object.values(row as Record<string, unknown>));
      return { rows: method === "get" ? rows[0] : rows };
    },
    { schema },
  ) as unknown as LocalDb;

  return {
    db,
    runOfficialSeed: () => sqlite.exec(officialSeedSql),
    templates: () =>
      sqlite.prepare("SELECT id, user_id, slug FROM templates ORDER BY id").all() as unknown as TemplateRow[],
    exec: (sql: string) => sqlite.exec(sql),
  };
}

function officialTemplates(rows: TemplateRow[]) {
  return rows.filter((row) => row.user_id === "serp-user");
}

function officialTemplateIds(rows: TemplateRow[]) {
  return officialTemplates(rows).map((row) => row.id);
}

// What the official seed inserts into a database without test data.
const expectedOfficialTemplates = (() => {
  const fresh = createMigratedDatabase();
  fresh.runOfficialSeed();
  return officialTemplates(fresh.templates());
})();
const expectedOfficialIds = expectedOfficialTemplates.map((row) => row.id);

describe("local seed with the official Templates", () => {
  it("inserts every official Template after the local test seed", async () => {
    const local = createMigratedDatabase();

    await seedLocalTestData(local.db);
    local.runOfficialSeed();

    expect(expectedOfficialIds).toContain("serp-template-technical-seo-audit");
    expect(officialTemplateIds(local.templates())).toEqual(expectedOfficialIds);
  });

  it("gives test Templates slugs that no official Template uses", async () => {
    const local = createMigratedDatabase();

    await seedLocalTestData(local.db);
    local.runOfficialSeed();

    const testIds = new Set<string>(TEST_TEMPLATE_IDS);
    const officialSlugs = new Set(expectedOfficialTemplates.map((row) => row.slug));
    const testSlugs = local.templates().filter((row) => testIds.has(row.id)).map((row) => row.slug);

    expect(testSlugs).toHaveLength(TEST_TEMPLATE_IDS.length);
    expect(testSlugs.filter((slug) => officialSlugs.has(slug))).toEqual([]);
  });

  it("seeds test data after the official Templates without a slug conflict", async () => {
    const local = createMigratedDatabase();

    local.runOfficialSeed();
    await seedLocalTestData(local.db);

    expect(officialTemplateIds(local.templates())).toEqual(expectedOfficialIds);
  });

  it("reruns the official seed without changes", () => {
    const local = createMigratedDatabase();

    local.runOfficialSeed();
    local.runOfficialSeed();

    expect(officialTemplateIds(local.templates())).toEqual(expectedOfficialIds);
  });

  it("fails instead of skipping an official Template whose slug is taken", () => {
    const local = createMigratedDatabase();
    local.exec(
      "INSERT INTO users (id, email, name) VALUES ('someone', 'someone@example.com', 'Someone');" +
        "INSERT INTO templates (id, user_id, title, items, slug, created_at) " +
        "VALUES ('someone-template', 'someone', 'Mine', '[]', 'technical-seo-audit-checklist', datetime('now'));",
    );

    expect(() => local.runOfficialSeed()).toThrow(/UNIQUE constraint failed: templates\.slug/);
  });
});
