import { and, count, eq, inArray, or } from "drizzle-orm";
import { account, audit_events, entitlement_overrides, templates, users } from "../schema/index";
import type { LocalDb } from "../../scripts/data/local-d1";
import { seedTestActivity } from "./local-test-data/activity";
import { cleanupLocalTestData } from "./local-test-data/cleanup";
import { DEV_PASSWORD_HASH, TEST_AUDIT_IDS, TEST_USER_EMAILS } from "./local-test-data/ids";
import { seedTestOrganizations } from "./local-test-data/organizations";
import { seedTestPeople } from "./local-test-data/people";
import { seedTestRuns } from "./local-test-data/runs";
import { seedTestTemplates } from "./local-test-data/templates";
import { seedClock, sqliteTime } from "./local-test-data/values";

export {
  DEV_PASSWORD_HASH,
  TEST_RUN_IDS,
  TEST_TEAM_IDS,
  TEST_TEAM_TEMPLATE_IDS,
  TEST_TEMPLATE_IDS,
  TEST_USER_EMAILS,
  TEST_USER_IDS,
} from "./local-test-data/ids";
export { cleanupLocalTestData };

export async function seedLocalTestData(db: LocalDb): Promise<void> {
  await cleanupLocalTestData(db);

  const clock = seedClock();
  await seedTestPeople(db, clock);
  await seedTestOrganizations(db, clock);
  await seedTestTemplates(db, clock);
  await seedTestRuns(db, clock);
  await seedTestActivity(db, clock);
}

export type LocalSeedStatus = {
  testData: boolean;
  officialTemplates: boolean;
  officialLogin: boolean;
  legacyTestSlugs: boolean;
};

export const LEGACY_TEST_TEMPLATE_SLUGS: Readonly<Record<string, string>> = {
  "template-1": "technical-seo-audit-checklist",
  "template-2": "keyword-research-mapping-checklist",
  "template-3": "content-refresh-checklist",
  "template-5": "local-seo-gbp-checklist",
};
const legacyTestSlugMatch = or(
  ...Object.entries(LEGACY_TEST_TEMPLATE_SLUGS).map(([id, slug]) =>
    and(eq(templates.id, id), eq(templates.slug, slug)),
  ),
);

function lastSeededAuditId(): string {
  const lastAuditId = TEST_AUDIT_IDS.at(-1);
  if (lastAuditId === undefined) throw new Error("TEST_AUDIT_IDS is empty, so no audit event marks the local seed complete");
  return lastAuditId;
}

const LOCAL_SEED_COMPLETE_AUDIT_ID = lastSeededAuditId();
const OFFICIAL_SEED_TEMPLATE_ID = "serp-template-technical-seo-audit";
const OFFICIAL_LOGIN_ACCOUNT_ID = "account-serp-user-credential";

const countOf = (rows: { value: number }[]): number => rows[0]?.value ?? 0;

export async function readLocalSeedStatus(db: LocalDb): Promise<LocalSeedStatus> {
  try {
    const [testUsers, marker, officialTemplate, officialLogin, legacySlugs] = await Promise.all([
      db.select({ value: count() }).from(users).where(inArray(users.email, TEST_USER_EMAILS)),
      db.select({ value: count() }).from(audit_events).where(eq(audit_events.id, LOCAL_SEED_COMPLETE_AUDIT_ID)),
      db
        .select({ value: count() })
        .from(templates)
        .where(and(eq(templates.id, OFFICIAL_SEED_TEMPLATE_ID), eq(templates.user_id, "serp-user"))),
      db
        .select({ value: count() })
        .from(account)
        .where(and(eq(account.id, OFFICIAL_LOGIN_ACCOUNT_ID), eq(account.userId, "serp-user"))),
      db.select({ value: count() }).from(templates).where(legacyTestSlugMatch),
    ]);
    return {
      testData: countOf(testUsers) === TEST_USER_EMAILS.length && countOf(marker) === 1,
      officialTemplates: countOf(officialTemplate) === 1,
      officialLogin: countOf(officialLogin) === 1,
      legacyTestSlugs: countOf(legacySlugs) > 0,
    };
  } catch (error) {
    if (/no such table/i.test(error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : String(error))) {
      return { testData: false, officialTemplates: false, officialLogin: false, legacyTestSlugs: false };
    }
    throw error;
  }
}

export async function repairLegacyTestTemplateSlugs(db: LocalDb): Promise<void> {
  for (const [id, legacySlug] of Object.entries(LEGACY_TEST_TEMPLATE_SLUGS)) {
    const sampleSlug = `sample-${legacySlug}`;
    const [taken] = await db.select({ id: templates.id }).from(templates).where(eq(templates.slug, sampleSlug)).limit(1);
    if (taken) continue;
    await db
      .update(templates)
      .set({ slug: sampleSlug })
      .where(and(eq(templates.id, id), eq(templates.slug, legacySlug)));
  }
}

export async function seedOfficialLocalLogin(db: LocalDb): Promise<void> {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const timestamp = sqliteTime(now);

  await db
    .delete(account)
    .where(and(eq(account.userId, "serp-user"), eq(account.providerId, "credential")));
  await db.insert(account).values({
    id: OFFICIAL_LOGIN_ACCOUNT_ID,
    accountId: "serp-user",
    providerId: "credential",
    userId: "serp-user",
    password: DEV_PASSWORD_HASH,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .update(users)
    .set({
      password_hash: DEV_PASSWORD_HASH,
      email_verified: true,
      auth_updated_at: now,
      updated_at: timestamp,
    })
    .where(eq(users.id, "serp-user"));
  await db
    .insert(entitlement_overrides)
    .values({
      user_id: "serp-user",
      plan: "pro",
      note: "Local official publisher persona: SERP (Pro)",
      created_at: timestamp,
      updated_at: timestamp,
    })
    .onConflictDoUpdate({
      target: entitlement_overrides.user_id,
      set: {
        plan: "pro",
        expires_at: null,
        note: "Local official publisher persona: SERP (Pro)",
        updated_at: timestamp,
      },
    });
}
