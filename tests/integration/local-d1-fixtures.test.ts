import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { D1Database } from "@cloudflare/workers-types";
import { count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getPlatformProxy } from "wrangler";
import {
  DEV_PASSWORD_HASH,
  TEST_RUN_IDS,
  TEST_TEAM_IDS,
  TEST_TEAM_TEMPLATE_IDS,
  TEST_TEMPLATE_IDS,
  TEST_USER_EMAILS,
  TEST_USER_IDS,
} from "../../db/seeds/local";
import {
  account,
  audit_events,
  checklist_runs,
  entitlement_overrides,
  team_entitlement_overrides,
  team_invites,
  team_members,
  teams,
  template_likes,
  template_versions,
  templates,
  usage_analytics,
  users,
} from "../../db/schema/index";
import { withLocalD1, type LocalDb } from "../../scripts/data/local-d1";
import { execTool } from "../../scripts/lib/run-tool.mjs";
import { handleTemplates } from "../../functions/api/handlers/templates";
import { getSessionUserId } from "../../functions/api/utils/session";

// The Template save test calls the API handler as a signed-in user.
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: vi.fn() }));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const persistPath = mkdtempSync(path.join(tmpdir(), "serplists-local-fixtures-"));
const OUTSIDER_ID = "unrelated-test-domain-user";
const OUTSIDER_ACCOUNT_ID = "unrelated-test-domain-account";
const OFFICIAL_TEMPLATE_IDS = [
  ...readFileSync(path.join(repoRoot, "db/seeds/official-templates.sql"), "utf8").matchAll(
    /^\s*'(serp-template-[a-z0-9-]+)',\s*$/gm,
  ),
]
  .map(([, id]) => id)
  .sort();

async function officialTemplateIds(db: LocalDb) {
  const rows = await db.select({ id: templates.id }).from(templates).where(eq(templates.user_id, "serp-user"));
  return rows.map(({ id }) => id).sort();
}

// Tools run through run-tool.mjs: spawning pnpm by name fails on Windows
// installs where pnpm is only a .cmd shim.
function runWrangler(args: string[]) {
  execTool("wrangler", args, {
    cwd: repoRoot,
    env: { ...process.env, CI: "1" },
    stdio: "pipe",
  });
}

function runLocalData(command: "seed-test" | "seed-official-login" | "cleanup" | "reset-passwords") {
  execTool(
    "tsx",
    [
      "scripts/data/local-d1-data.ts",
      command,
      "--persist-to",
      persistPath,
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, CI: "1" },
      stdio: "pipe",
    },
  );
}

async function fixtureCounts(db: LocalDb) {
  const results = await Promise.all([
    db.select({ value: count() }).from(users).where(inArray(users.id, TEST_USER_IDS)),
    db.select({ value: count() }).from(account).where(inArray(account.userId, TEST_USER_IDS)),
    db
      .select({ value: count() })
      .from(entitlement_overrides)
      .where(inArray(entitlement_overrides.user_id, TEST_USER_IDS)),
    db.select({ value: count() }).from(teams).where(inArray(teams.id, TEST_TEAM_IDS)),
    db
      .select({ value: count() })
      .from(team_members)
      .where(inArray(team_members.team_id, TEST_TEAM_IDS)),
    db
      .select({ value: count() })
      .from(team_invites)
      .where(inArray(team_invites.team_id, TEST_TEAM_IDS)),
    db
      .select({ value: count() })
      .from(team_entitlement_overrides)
      .where(inArray(team_entitlement_overrides.team_id, TEST_TEAM_IDS)),
    db
      .select({ value: count() })
      .from(templates)
      .where(inArray(templates.id, [...TEST_TEMPLATE_IDS, ...TEST_TEAM_TEMPLATE_IDS])),
    db.select({ value: count() }).from(checklist_runs).where(inArray(checklist_runs.id, TEST_RUN_IDS)),
    db.select({ value: count() }).from(template_likes).where(inArray(template_likes.user_id, TEST_USER_IDS)),
    db.select({ value: count() }).from(usage_analytics).where(inArray(usage_analytics.user_id, TEST_USER_IDS)),
    db
      .select({ value: count() })
      .from(template_versions)
      .where(inArray(template_versions.template_id, TEST_TEAM_TEMPLATE_IDS)),
    db.select({ value: count() }).from(audit_events).where(inArray(audit_events.subject_id, TEST_TEAM_IDS)),
  ]);
  return results.map(([row]) => row.value);
}

async function insertOutsider(db: LocalDb) {
  await db.insert(users).values({
    id: OUTSIDER_ID,
    email: "outsider@test.com",
    password_hash: "outsider-password",
    email_verified: false,
    auth_created_at: new Date(0),
    auth_updated_at: new Date(0),
    created_at: "2026-01-01 00:00:00",
  });
  await db.insert(account).values({
    id: OUTSIDER_ACCOUNT_ID,
    accountId: OUTSIDER_ID,
    providerId: "credential",
    userId: OUTSIDER_ID,
    password: "outsider-password",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
}

describe("local Drizzle fixture commands", () => {
  beforeAll(() => {
    runWrangler([
      "d1",
      "migrations",
      "apply",
      "serp-checklists-db",
      "--local",
      "--persist-to",
      persistPath,
    ]);
  }, 30_000);

  afterAll(() => {
    rmSync(persistPath, { recursive: true, force: true });
  });

  it(
    "is repeatable, restartable, exact-scope, and preserves credential shapes",
    async () => {
      await withLocalD1(persistPath, insertOutsider);

      runLocalData("seed-test");
      runWrangler([
        "d1",
        "execute",
        "serp-checklists-db",
        "--local",
        "--persist-to",
        persistPath,
        "--file",
        "db/seeds/official-templates.sql",
      ]);
      runLocalData("seed-official-login");

      runLocalData("seed-test");
      runWrangler([
        "d1",
        "execute",
        "serp-checklists-db",
        "--local",
        "--persist-to",
        persistPath,
        "--file",
        "db/seeds/official-templates.sql",
      ]);
      runLocalData("seed-official-login");

      let initialTestAccountIds: string[] = [];
      await withLocalD1(persistPath, async (db) => {
        expect(await fixtureCounts(db)).toEqual([4, 4, 2, 2, 6, 1, 1, 7, 5, 5, 4, 3, 5]);

        const [admin] = await db.select().from(users).where(eq(users.id, "user-1"));
        const [teamRun] = await db
          .select()
          .from(checklist_runs)
          .where(eq(checklist_runs.id, "team-run-growth-launch"));
        const [invite] = await db
          .select()
          .from(team_invites)
          .where(eq(team_invites.id, "team-invite-seed-client-john"));
        const testAccounts = await db.select().from(account).where(inArray(account.userId, TEST_USER_IDS));

        expect(admin).toMatchObject({ email: "admin@test.com", name: "Admin (Pro)" });
        expect(admin.auth_created_at?.getTime() % 1000).toBe(0);
        expect(admin.auth_updated_at?.getTime() % 1000).toBe(0);
        expect(teamRun).toMatchObject({ progress: 33, assigned_to_user_id: "user-4" });
        expect(invite).toMatchObject({ email: "john@test.com", role: "editor" });
        expect(testAccounts.every(({ id }) => /^[0-9a-f]{32}$/.test(id))).toBe(true);
        expect(
          testAccounts.every(
            ({ createdAt, updatedAt }) =>
              createdAt.getTime() % 1000 === 0 && updatedAt.getTime() % 1000 === 0,
          ),
        ).toBe(true);
        initialTestAccountIds = testAccounts.map(({ id }) => id).sort();

        expect(OFFICIAL_TEMPLATE_IDS).toHaveLength(5);
        expect(await officialTemplateIds(db)).toEqual(OFFICIAL_TEMPLATE_IDS);
        expect(await db.select().from(users).where(eq(users.id, OUTSIDER_ID))).toHaveLength(1);
        expect(await db.select().from(account).where(eq(account.id, OUTSIDER_ACCOUNT_ID))).toHaveLength(1);
      });

      runLocalData("cleanup");

      await withLocalD1(persistPath, async (db) => {
        expect(await fixtureCounts(db)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        expect(await officialTemplateIds(db)).toEqual(OFFICIAL_TEMPLATE_IDS);
        expect(await db.select().from(users).where(eq(users.id, "serp-user"))).toHaveLength(1);
        expect(
          await db.select().from(account).where(eq(account.id, "account-serp-user-credential")),
        ).toHaveLength(1);
        expect(
          await db
            .select()
            .from(entitlement_overrides)
            .where(eq(entitlement_overrides.user_id, "serp-user")),
        ).toHaveLength(1);
        expect(await db.select().from(users).where(eq(users.id, OUTSIDER_ID))).toHaveLength(1);
        expect(await db.select().from(account).where(eq(account.id, OUTSIDER_ACCOUNT_ID))).toHaveLength(1);

        await db.insert(users).values({
          id: "user-1",
          email: "admin@test.com",
          password_hash: "partial",
          email_verified: false,
          auth_created_at: new Date(0),
          auth_updated_at: new Date(0),
          created_at: "2026-01-01 00:00:00",
        });
        await db.insert(account).values({
          id: "00000000000000000000000000000000",
          accountId: "user-1",
          providerId: "credential",
          userId: "user-1",
          password: "partial",
          createdAt: new Date(0),
          updatedAt: new Date(0),
        });
      });

      runLocalData("seed-test");

      await withLocalD1(persistPath, async (db) => {
        expect(await fixtureCounts(db)).toEqual([4, 4, 2, 2, 6, 1, 1, 7, 5, 5, 4, 3, 5]);
        const recoveredTestAccountIds = (
          await db.select({ id: account.id }).from(account).where(inArray(account.userId, TEST_USER_IDS))
        )
          .map(({ id }) => id)
          .sort();
        expect(recoveredTestAccountIds).toEqual(initialTestAccountIds);
        await db
          .update(users)
          .set({ password_hash: "changed" })
          .where(inArray(users.email, [...TEST_USER_EMAILS, "checklists@serp.co"]));
        await db
          .update(account)
          .set({ password: "changed" })
          .where(inArray(account.userId, [...TEST_USER_IDS, "serp-user"]));
      });

      runLocalData("reset-passwords");

      await withLocalD1(persistPath, async (db) => {
        const resetUsers = await db
          .select({ password: users.password_hash, updatedAt: users.auth_updated_at })
          .from(users)
          .where(inArray(users.email, [...TEST_USER_EMAILS, "checklists@serp.co"]));
        const resetAccounts = await db
          .select({ password: account.password, updatedAt: account.updatedAt })
          .from(account)
          .where(inArray(account.userId, [...TEST_USER_IDS, "serp-user"]));
        expect(resetUsers).toHaveLength(5);
        expect(
          resetUsers.every(
            ({ password, updatedAt }) =>
              password === DEV_PASSWORD_HASH && updatedAt != null && updatedAt.getTime() % 1000 === 0,
          ),
        ).toBe(true);
        expect(resetAccounts).toHaveLength(5);
        expect(
          resetAccounts.every(
            ({ password, updatedAt }) =>
              password === DEV_PASSWORD_HASH && updatedAt.getTime() % 1000 === 0,
          ),
        ).toBe(true);
        expect(
          await db.select({ password: users.password_hash }).from(users).where(eq(users.id, OUTSIDER_ID)),
        ).toEqual([{ password: "outsider-password" }]);
        expect(
          await db.select({ password: account.password }).from(account).where(eq(account.id, OUTSIDER_ACCOUNT_ID)),
        ).toEqual([{ password: "outsider-password" }]);
      });
    },
    60_000,
  );

  it(
    "cleans up Organizations, invites and Template history the test users created",
    async () => {
      runLocalData("seed-test");
      await withLocalD1(persistPath, async (db) => {
        if ((await db.select().from(users).where(eq(users.id, OUTSIDER_ID))).length === 0) {
          await insertOutsider(db);
        }
        const createdAt = "2026-01-01 00:00:00";
        const expiresAt = "2099-01-01 00:00:00";
        await db.insert(teams).values([
          { id: "team-user-acme", name: "Acme", created_by_user_id: "user-2", created_at: createdAt },
          { id: "team-outsider-co", name: "Outsider Co", created_by_user_id: OUTSIDER_ID, created_at: createdAt },
        ]);
        await db.insert(team_members).values([
          { id: "acme-owner", team_id: "team-user-acme", user_id: "user-2", role: "owner", created_at: createdAt },
          { id: "outsider-owner", team_id: "team-outsider-co", user_id: OUTSIDER_ID, role: "owner", created_at: createdAt },
          { id: "outsider-jane", team_id: "team-outsider-co", user_id: "user-3", role: "admin", created_at: createdAt },
        ]);
        await db.insert(team_invites).values([
          {
            id: "acme-invite",
            team_id: "team-user-acme",
            email: "new@example.com",
            token_hash: "acme-invite-token",
            invited_by_user_id: "user-2",
            expires_at: expiresAt,
            created_at: createdAt,
          },
          {
            id: "outsider-invite",
            team_id: "team-outsider-co",
            email: "friend@example.com",
            token_hash: "outsider-invite-token",
            invited_by_user_id: "user-3",
            expires_at: expiresAt,
            created_at: createdAt,
          },
        ]);
        await db.insert(templates).values({
          id: "outsider-team-template",
          user_id: OUTSIDER_ID,
          title: "Outsider Template",
          items: "[]",
          owner_type: "team",
          team_id: "team-outsider-co",
          created_at: createdAt,
        });
        await db.insert(template_versions).values({
          id: "outsider-team-template-v1",
          template_id: "outsider-team-template",
          version: 1,
          changed_by_user_id: "user-2",
          subject_type: "team",
          subject_id: "team-outsider-co",
          snapshot_json: "{}",
          created_at: createdAt,
        });
      });

      runLocalData("cleanup");

      await withLocalD1(persistPath, async (db) => {
        expect(await fixtureCounts(db)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        const remainingTeams = await db
          .select({ id: teams.id })
          .from(teams)
          .where(inArray(teams.id, ["team-user-acme", "team-outsider-co"]));
        expect(remainingTeams).toEqual([{ id: "team-outsider-co" }]);
        expect(
          await db.select().from(team_invites).where(inArray(team_invites.invited_by_user_id, TEST_USER_IDS)),
        ).toEqual([]);
        expect(
          await db
            .select()
            .from(template_versions)
            .where(inArray(template_versions.changed_by_user_id, TEST_USER_IDS)),
        ).toEqual([]);
        expect(
          await db.select({ id: templates.id }).from(templates).where(eq(templates.id, "outsider-team-template")),
        ).toEqual([{ id: "outsider-team-template" }]);
        expect(await db.select().from(users).where(eq(users.id, OUTSIDER_ID))).toHaveLength(1);
        expect(await db.select().from(account).where(eq(account.id, OUTSIDER_ACCOUNT_ID))).toHaveLength(1);
      });

      runLocalData("seed-test");

      await withLocalD1(persistPath, async (db) => {
        expect(await fixtureCounts(db)).toEqual([4, 4, 2, 2, 6, 1, 1, 7, 5, 5, 4, 3, 5]);
      });
    },
    60_000,
  );

  it(
    "seeds Template versions that a save can advance",
    async () => {
      runLocalData("seed-test");
      const seededTemplateIds = [...TEST_TEMPLATE_IDS, ...TEST_TEAM_TEMPLATE_IDS];

      await withLocalD1(persistPath, async (db) => {
        const seeded = await db
          .select({ id: templates.id, version: templates.version, contentVersion: templates.content_version })
          .from(templates)
          .where(inArray(templates.id, seededTemplateIds));
        const history = await db
          .select({ templateId: template_versions.template_id, version: template_versions.version })
          .from(template_versions)
          .where(inArray(template_versions.template_id, seededTemplateIds));
        const runs = await db
          .select({ id: checklist_runs.id, templateId: checklist_runs.template_id, templateVersion: checklist_runs.template_version })
          .from(checklist_runs)
          .where(inArray(checklist_runs.id, TEST_RUN_IDS));

        // A save writes history row templates.version + 1, so no seeded history row may be newer.
        for (const template of seeded) {
          const newestHistory = Math.max(0, ...history.filter((row) => row.templateId === template.id).map((row) => row.version));
          expect(newestHistory, template.id).toBeLessThanOrEqual(template.version);
        }
        for (const run of runs) {
          const template = seeded.find(({ id }) => id === run.templateId);
          if (template) expect(run.templateVersion, run.id).toBeLessThanOrEqual(template.contentVersion);
        }
      });

      const platform = await getPlatformProxy<{ DB: D1Database }>({
        configPath: path.join(repoRoot, "wrangler.toml"),
        envFiles: [".local-d1-env-disabled"],
        persist: { path: path.resolve(repoRoot, persistPath, "v3") },
        remoteBindings: false,
      });
      try {
        const env = { DB: platform.env.DB } as unknown as Parameters<typeof handleTemplates>[1];
        const url = "http://localhost/api/templates/team-template-growth-launch";
        const load = async () => {
          const response = await handleTemplates(new Request(url), env);
          expect(response.status).toBe(200);
          return (await response.json()) as { title: string; version: number };
        };
        vi.mocked(getSessionUserId).mockResolvedValue("user-1");

        const loaded = await load();
        const response = await handleTemplates(
          new Request(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: `${loaded.title} (edited)`, expected_version: loaded.version }),
          }),
          env,
        );

        expect(response.status, await response.clone().text()).toBe(200);
        expect(await load()).toMatchObject({ title: `${loaded.title} (edited)`, version: loaded.version + 1 });
      } finally {
        await platform.dispose();
      }
    },
    60_000,
  );
});
