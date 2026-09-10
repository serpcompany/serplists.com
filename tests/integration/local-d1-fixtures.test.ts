import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const persistPath = mkdtempSync(path.join(tmpdir(), "serplists-local-fixtures-"));
const OUTSIDER_ID = "unrelated-test-domain-user";
const OUTSIDER_ACCOUNT_ID = "unrelated-test-domain-account";

function runWrangler(args: string[]) {
  execFileSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: repoRoot,
    env: { ...process.env, CI: "1" },
    stdio: "pipe",
  });
}

function runLocalData(command: "seed-test" | "seed-official-login" | "cleanup" | "reset-passwords") {
  execFileSync(
    "pnpm",
    [
      "exec",
      "tsx",
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

      let officialTemplateCount = 0;
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

        [{ value: officialTemplateCount }] = await db
          .select({ value: count() })
          .from(templates)
          .where(eq(templates.user_id, "serp-user"));
        expect(await db.select().from(users).where(eq(users.id, OUTSIDER_ID))).toHaveLength(1);
        expect(await db.select().from(account).where(eq(account.id, OUTSIDER_ACCOUNT_ID))).toHaveLength(1);
      });

      runLocalData("cleanup");

      await withLocalD1(persistPath, async (db) => {
        expect(await fixtureCounts(db)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        const [{ value: officialTemplatesAfterCleanup }] = await db
          .select({ value: count() })
          .from(templates)
          .where(eq(templates.user_id, "serp-user"));
        expect(officialTemplatesAfterCleanup).toBe(officialTemplateCount);
        expect(officialTemplatesAfterCleanup).toBeGreaterThan(0);
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
});
