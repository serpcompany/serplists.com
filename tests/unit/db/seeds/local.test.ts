import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import {
  cleanupLocalTestData,
  seedLocalTestData,
  TEST_TEMPLATE_IDS,
  TEST_USER_IDS,
} from "../../../../db/seeds/local";
import * as schema from "../../../../db/schema/index";
import type { LocalDb } from "../../../../scripts/data/local-d1";

const migrationsDir = path.join("db", "migrations");
const officialSeedSql = readFileSync(path.join("db", "seeds", "official-templates.sql"), "utf8");

type TemplateRow = { id: string; user_id: string; slug: string | null };
type Method = "run" | "all" | "values" | "get";

// A local database with every migration applied (foreign keys on, as in D1),
// driven through Drizzle the way the seed scripts drive local D1. A batch runs
// in one transaction, like a D1 batch.
function createMigratedDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  const execute = (sql: string, params: unknown[], method: Method) => {
    const statement = sqlite.prepare(sql);
    const values = params as Parameters<typeof statement.run>;
    if (method === "run") {
      statement.run(...values);
      return { rows: [] };
    }
    const rows = statement.all(...values).map((row) => Object.values(row as Record<string, unknown>));
    return { rows: method === "get" ? rows[0] : rows };
  };

  const db = drizzle(
    async (sql, params, method) => execute(sql, params, method),
    async (queries) => {
      sqlite.exec("BEGIN");
      try {
        const results = queries.map(({ sql, params, method }) => execute(sql, params, method));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    { schema },
  ) as unknown as LocalDb;

  return {
    db,
    runOfficialSeed: () => sqlite.exec(officialSeedSql),
    templates: () =>
      sqlite.prepare("SELECT id, user_id, slug FROM templates ORDER BY id").all() as unknown as TemplateRow[],
    ids: (sql: string) => sqlite.prepare(sql).all().map((row) => String((row as { id: unknown }).id)),
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

const testUserList = TEST_USER_IDS.map((id) => `'${id}'`).join(", ");

// Rows a developer creates by using the app as the seeded users: an Organization
// john@test.com created (with an outsider member, an invite, a Template, a Run
// and history), plus an outsider's Organization where test users are members,
// send invites and edit Templates.
const USER_CREATED_DATA_SQL = `
INSERT INTO users (id, email, name) VALUES ('outsider', 'outsider@example.com', 'Outsider');
INSERT INTO account (id, account_id, provider_id, user_id)
  VALUES ('outsider-account', 'outsider', 'credential', 'outsider');

INSERT INTO teams (id, name, created_by_user_id, created_at)
  VALUES ('team-acme', 'Acme', 'user-2', datetime('now'));
INSERT INTO team_members (id, team_id, user_id, role, created_at) VALUES
  ('acme-owner', 'team-acme', 'user-2', 'owner', datetime('now')),
  ('acme-outsider', 'team-acme', 'outsider', 'editor', datetime('now'));
INSERT INTO team_invites (id, team_id, email, token_hash, invited_by_user_id, expires_at, created_at)
  VALUES ('acme-invite', 'team-acme', 'new@example.com', 'acme-token', 'user-2', datetime('now', '+7 days'), datetime('now'));
INSERT INTO templates (id, user_id, title, items, owner_type, team_id, created_at)
  VALUES ('acme-template', 'outsider', 'Acme Template', '[]', 'team', 'team-acme', datetime('now'));
INSERT INTO template_versions (id, template_id, version, changed_by_user_id, subject_type, subject_id, snapshot_json, created_at)
  VALUES ('acme-template-v1', 'acme-template', 1, 'outsider', 'team', 'team-acme', '{}', datetime('now'));
INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, started_at, created_at)
  VALUES ('acme-run', 'outsider', 'team-acme', 'acme-template', 'Acme Run', '[]', datetime('now'), datetime('now'));
INSERT INTO audit_events (id, subject_type, subject_id, resource_type, resource_id, action, created_at)
  VALUES ('acme-audit', 'team', 'team-acme', 'team', 'team-acme', 'team.created', datetime('now'));

INSERT INTO teams (id, name, created_by_user_id, created_at)
  VALUES ('team-outsider', 'Outsider Co', 'outsider', datetime('now'));
INSERT INTO team_members (id, team_id, user_id, role, created_at) VALUES
  ('outsider-owner', 'team-outsider', 'outsider', 'owner', datetime('now')),
  ('outsider-jane', 'team-outsider', 'user-3', 'admin', datetime('now'));
INSERT INTO team_invites (id, team_id, email, token_hash, invited_by_user_id, expires_at, created_at)
  VALUES ('outsider-invite', 'team-outsider', 'friend@example.com', 'outsider-token', 'user-3', datetime('now', '+7 days'), datetime('now'));
INSERT INTO templates (id, user_id, title, items, owner_type, team_id, created_at)
  VALUES ('outsider-template', 'outsider', 'Outsider Template', '[]', 'team', 'team-outsider', datetime('now'));
INSERT INTO template_versions (id, template_id, version, changed_by_user_id, subject_type, subject_id, snapshot_json, created_at)
  VALUES ('outsider-template-v1', 'outsider-template', 1, 'user-2', 'team', 'team-outsider', '{}', datetime('now'));
`;

// The user foreign keys that block deleting a user. USER_CREATED_DATA_SQL must
// point each one at a test user so the cleanup test covers it.
const BLOCKING_USER_FOREIGN_KEYS = [
  "team_invites.invited_by_user_id",
  "teams.created_by_user_id",
  "template_versions.changed_by_user_id",
];

describe("cleanupLocalTestData", () => {
  it("removes Organizations, invites and history the test users created", async () => {
    const local = createMigratedDatabase();
    await seedLocalTestData(local.db);
    local.exec(USER_CREATED_DATA_SQL);

    await cleanupLocalTestData(local.db);

    expect(local.ids(`SELECT id FROM users WHERE id IN (${testUserList})`)).toEqual([]);
    expect(local.ids("SELECT id FROM teams ORDER BY id")).toEqual(["team-outsider"]);
    expect(local.ids("SELECT id FROM team_members ORDER BY id")).toEqual(["outsider-owner"]);
    expect(local.ids("SELECT id FROM team_invites")).toEqual([]);
    expect(local.ids("SELECT id FROM templates WHERE user_id = 'outsider'")).toEqual(["outsider-template"]);
    expect(local.ids("SELECT id FROM template_versions")).toEqual([]);
    expect(local.ids("SELECT id FROM checklist_runs WHERE id = 'acme-run'")).toEqual([]);
    expect(local.ids("SELECT id FROM audit_events WHERE subject_id = 'team-acme'")).toEqual([]);
    expect(local.ids("SELECT id FROM users WHERE id = 'outsider'")).toEqual(["outsider"]);
    expect(local.ids("SELECT id FROM account WHERE user_id = 'outsider'")).toEqual(["outsider-account"]);

    await seedLocalTestData(local.db);
    expect(local.ids(`SELECT id FROM users WHERE id IN (${testUserList}) ORDER BY id`)).toEqual([...TEST_USER_IDS]);
  });

  it("covers every foreign key that blocks deleting a user", () => {
    const local = createMigratedDatabase();
    const tables = local.ids("SELECT name AS id FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    const blocking = tables.flatMap((table) =>
      local
        .ids(
          `SELECT "from" AS id FROM pragma_foreign_key_list('${table}') ` +
            "WHERE \"table\" = 'users' AND on_delete IN ('RESTRICT', 'NO ACTION')",
        )
        .map((column) => `${table}.${column}`),
    );

    // A new entry here needs a matching delete in cleanupLocalTestData and a row
    // in USER_CREATED_DATA_SQL.
    expect(blocking.sort()).toEqual(BLOCKING_USER_FOREIGN_KEYS);
  });

  it("deletes nothing when any step fails", async () => {
    const local = createMigratedDatabase();
    await seedLocalTestData(local.db);
    local.exec(
      "CREATE TRIGGER block_admin_delete BEFORE DELETE ON users WHEN OLD.id = 'user-1' " +
        "BEGIN SELECT RAISE(ABORT, 'blocked by test'); END;",
    );
    const accountsBefore = local.ids(`SELECT id FROM account WHERE user_id IN (${testUserList}) ORDER BY id`);
    const templatesBefore = local.ids("SELECT id FROM templates ORDER BY id");

    await expect(cleanupLocalTestData(local.db)).rejects.toThrow();

    expect(accountsBefore).toHaveLength(TEST_USER_IDS.length);
    expect(local.ids(`SELECT id FROM account WHERE user_id IN (${testUserList}) ORDER BY id`)).toEqual(accountsBefore);
    expect(local.ids("SELECT id FROM templates ORDER BY id")).toEqual(templatesBefore);
  });
});
