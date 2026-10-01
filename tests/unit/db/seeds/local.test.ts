import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { describe, expect, it } from "vitest";
import {
  cleanupLocalTestData,
  LEGACY_TEST_TEMPLATE_SLUGS,
  readLocalSeedStatus,
  repairLegacyTestTemplateSlugs,
  seedLocalTestData,
  seedOfficialLocalLogin,
  TEST_TEMPLATE_IDS,
  TEST_USER_IDS,
} from "../../../../db/seeds/local";
import * as schema from "../../../../db/schema/index";
import type { LocalDb } from "../../../../scripts/data/local-d1";
import { planSeedSteps } from "../../../../scripts/lib/local-d1-seed.mjs";
import { createMigratedD1 } from "../../../fixtures/sqliteD1";

const officialSeedSql = readFileSync(path.join("db", "seeds", "official-templates.sql"), "utf8");

type TemplateRow = { id: string; user_id: string; slug: string | null };
type Method = "run" | "all" | "values" | "get";

function migratedLocalD1DrivenAsTheSeedScriptsDriveIt() {
  const sqlite = createMigratedD1().sqlite;

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

const officialTemplatesOfAFreshSeed = (() => {
  const fresh = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();
  fresh.runOfficialSeed();
  return officialTemplates(fresh.templates());
})();
const expectedOfficialIds = officialTemplatesOfAFreshSeed.map((row) => row.id);

describe("local seed with the official Templates", () => {
  it("inserts every official Template after the local test seed", async () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();

    await seedLocalTestData(local.db);
    local.runOfficialSeed();

    expect(expectedOfficialIds).toContain("serp-template-technical-seo-audit");
    expect(officialTemplateIds(local.templates())).toEqual(expectedOfficialIds);
  });

  it("gives test Templates slugs that no official Template uses", async () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();

    await seedLocalTestData(local.db);
    local.runOfficialSeed();

    const testIds = new Set<string>(TEST_TEMPLATE_IDS);
    const officialSlugs = new Set(officialTemplatesOfAFreshSeed.map((row) => row.slug));
    const testSlugs = local.templates().filter((row) => testIds.has(row.id)).map((row) => row.slug);

    expect(testSlugs).toHaveLength(TEST_TEMPLATE_IDS.length);
    expect(testSlugs.filter((slug) => officialSlugs.has(slug))).toEqual([]);
  });

  it("seeds test data after the official Templates without a slug conflict", async () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();

    local.runOfficialSeed();
    await seedLocalTestData(local.db);

    expect(officialTemplateIds(local.templates())).toEqual(expectedOfficialIds);
  });

  it("reruns the official seed without changes", () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();

    local.runOfficialSeed();
    local.runOfficialSeed();

    expect(officialTemplateIds(local.templates())).toEqual(expectedOfficialIds);
  });

  it("fails instead of skipping an official Template whose slug is taken", () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();
    local.exec(
      "INSERT INTO users (id, email, name) VALUES ('someone', 'someone@example.com', 'Someone');" +
        "INSERT INTO templates (id, user_id, title, items, slug, created_at) " +
        "VALUES ('someone-template', 'someone', 'Mine', '[]', 'technical-seo-audit-checklist', datetime('now'));",
    );

    expect(() => local.runOfficialSeed()).toThrow(/UNIQUE constraint failed: templates\.slug/);
  });
});

const testUserList = TEST_USER_IDS.map((id) => `'${id}'`).join(", ");

const ROWS_A_DEVELOPER_CREATES_USING_THE_APP_AS_THE_SEEDED_USERS_SQL = `
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

const BLOCKING_USER_FOREIGN_KEYS = [
  "team_invites.invited_by_user_id",
  "teams.created_by_user_id",
  "template_versions.changed_by_user_id",
];

describe("cleanupLocalTestData", () => {
  it("removes Organizations, invites and history the test users created", async () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();
    await seedLocalTestData(local.db);
    local.exec(ROWS_A_DEVELOPER_CREATES_USING_THE_APP_AS_THE_SEEDED_USERS_SQL);

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

  it("covers every foreign key that blocks deleting a user, so a new one needs a delete in cleanupLocalTestData and a developer row pointing it at a test user", () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();
    const tables = local.ids("SELECT name AS id FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'");
    const blocking = tables.flatMap((table) =>
      local
        .ids(
          `SELECT "from" AS id FROM pragma_foreign_key_list('${table}') ` +
            "WHERE \"table\" = 'users' AND on_delete IN ('RESTRICT', 'NO ACTION')",
        )
        .map((column) => `${table}.${column}`),
    );

    expect(blocking.sort()).toEqual(BLOCKING_USER_FOREIGN_KEYS);
  });

  it("deletes nothing when any step fails", async () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();
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

const PRE_SAMPLE_TEST_SLUGS: Record<string, string> = {
  "template-1": "technical-seo-audit-checklist",
  "template-2": "keyword-research-mapping-checklist",
  "template-3": "content-refresh-checklist",
  "template-5": "local-seo-gbp-checklist",
};

async function databaseSeededBeforeSampleSlugs() {
  const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();
  await seedLocalTestData(local.db);
  local.runOfficialSeed();
  await seedOfficialLocalLogin(local.db);
  for (const [id, slug] of Object.entries(PRE_SAMPLE_TEST_SLUGS)) {
    local.exec(
      `DELETE FROM templates WHERE user_id = 'serp-user' AND slug = '${slug}';` +
        `UPDATE templates SET slug = '${slug}' WHERE id = '${id}';`,
    );
  }
  return local;
}

type LocalDatabase = ReturnType<typeof migratedLocalD1DrivenAsTheSeedScriptsDriveIt>;

async function runTheStageSetupPlanned(local: LocalDatabase, step: string) {
  if (step === "seed-test") return seedLocalTestData(local.db);
  if (step === "repair-test-slugs") return repairLegacyTestTemplateSlugs(local.db);
  if (step === "official-templates") return local.runOfficialSeed();
  if (step === "official-login") return seedOfficialLocalLogin(local.db);
  throw new Error(`Unexpected seed stage ${step}`);
}

const testSlugs = (local: LocalDatabase) =>
  Object.fromEntries(
    local.templates().filter((row) => row.id in PRE_SAMPLE_TEST_SLUGS).map((row) => [row.id, row.slug]),
  );

const DEVELOPER_TEMPLATE_SQL =
  "INSERT INTO templates (id, user_id, title, items, slug, created_at) " +
  "VALUES ('developer-template', 'user-2', 'Mine', '[]', 'developer-template', datetime('now'));";

describe("setup on a database seeded before the sample- test slugs", () => {
  it("renames the old test slugs in place so the official Templates seed, without reseeding test data", async () => {
    const local = await databaseSeededBeforeSampleSlugs();
    local.exec(DEVELOPER_TEMPLATE_SQL);
    expect(() => local.runOfficialSeed()).toThrow(/UNIQUE constraint failed: templates\.slug/);

    const status = await readLocalSeedStatus(local.db);
    expect(status).toEqual({ testData: true, officialTemplates: false, officialLogin: true, legacyTestSlugs: true });
    const plan = planSeedSteps(status);
    expect(plan).not.toContain("seed-test");
    for (const step of plan) await runTheStageSetupPlanned(local, step);

    expect(officialTemplateIds(local.templates())).toEqual(expectedOfficialIds);
    expect(testSlugs(local)).toEqual(
      Object.fromEntries(Object.entries(PRE_SAMPLE_TEST_SLUGS).map(([id, slug]) => [id, `sample-${slug}`])),
    );
    expect(local.ids("SELECT id FROM templates WHERE id = 'developer-template'")).toEqual(["developer-template"]);

    const repaired = await readLocalSeedStatus(local.db);
    expect(repaired).toEqual({ testData: true, officialTemplates: true, officialLogin: true, legacyTestSlugs: false });
    expect(planSeedSteps(repaired)).toEqual([]);
  });

  it("leaves renamed test Templates and every other Template alone, and keeps an old slug whose sample- slug is taken rather than failing", async () => {
    const local = await databaseSeededBeforeSampleSlugs();
    local.exec(
      "UPDATE templates SET slug = 'my-keyword-list' WHERE id = 'template-2';" +
        "UPDATE templates SET slug = 'my-gbp-list' WHERE id = 'template-5';" +
        "INSERT INTO templates (id, user_id, title, items, slug, created_at) " +
        "VALUES ('developer-gbp', 'user-2', 'GBP', '[]', 'local-seo-gbp-checklist', datetime('now'));" +
        "INSERT INTO templates (id, user_id, title, items, slug, created_at) " +
        "VALUES ('developer-audit', 'user-2', 'Audit', '[]', 'sample-technical-seo-audit-checklist', datetime('now'));",
    );

    await repairLegacyTestTemplateSlugs(local.db);

    expect(testSlugs(local)).toEqual({
      "template-1": "technical-seo-audit-checklist",
      "template-2": "my-keyword-list",
      "template-3": "sample-content-refresh-checklist",
      "template-5": "my-gbp-list",
    });
    expect(local.ids("SELECT slug AS id FROM templates WHERE id LIKE 'developer-%' ORDER BY slug")).toEqual([
      "local-seo-gbp-checklist",
      "sample-technical-seo-audit-checklist",
    ]);
    expect(() => local.runOfficialSeed()).toThrow(/UNIQUE constraint failed: templates\.slug/);
  });

  it("changes nothing on a database seeded today", async () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();
    await seedLocalTestData(local.db);
    local.runOfficialSeed();
    const before = local.templates();

    await repairLegacyTestTemplateSlugs(local.db);

    expect(local.templates()).toEqual(before);
    expect((await readLocalSeedStatus(local.db)).legacyTestSlugs).toBe(false);
  });

  it("knows the old slugs: each is an official slug the seed now prefixes with sample-", async () => {
    const local = migratedLocalD1DrivenAsTheSeedScriptsDriveIt();
    await seedLocalTestData(local.db);
    const officialSlugs = new Set(officialTemplatesOfAFreshSeed.map((row) => row.slug));

    expect(LEGACY_TEST_TEMPLATE_SLUGS).toEqual(PRE_SAMPLE_TEST_SLUGS);
    for (const slug of Object.values(LEGACY_TEST_TEMPLATE_SLUGS)) expect(officialSlugs).toContain(slug);
    expect(testSlugs(local)).toEqual(
      Object.fromEntries(Object.entries(LEGACY_TEST_TEMPLATE_SLUGS).map(([id, slug]) => [id, `sample-${slug}`])),
    );
  });
});
