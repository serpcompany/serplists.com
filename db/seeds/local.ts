import { and, eq, inArray, or } from "drizzle-orm";
import { account, auditEvents, entitlementOverrides, templates, users } from "../schema/index";
import type { LocalDb } from "../../scripts/data/local-d1";
import { seedTestActivity } from "./local-test-data/activity";
import { cleanupLocalTestData } from "./local-test-data/cleanup";
import { DEV_PASSWORD_HASH, LOCAL_SEED_COMPLETE_AUDIT_ID, TEST_USER_EMAILS } from "./local-test-data/ids";
import { seedTestOrganizations } from "./local-test-data/organizations";
import { seedTestPeople } from "./local-test-data/people";
import { seedTestRuns } from "./local-test-data/runs";
import { seedTestTemplates } from "./local-test-data/templates";
import { seedClock, sqliteTime } from "./local-test-data/values";

export { DEV_PASSWORD_HASH, TEST_USER_EMAILS } from "./local-test-data/ids";
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

const OFFICIAL_SEED_TEMPLATE_ID = "serp-template-technical-seo-audit";
const OFFICIAL_LOGIN_ACCOUNT_ID = "account-serp-user-credential";

export async function readLocalSeedStatus(db: LocalDb): Promise<LocalSeedStatus> {
  try {
    const [testUsers, marker, officialTemplate, officialLogin, legacySlugs] = await Promise.all([
      db.$count(users, inArray(users.email, TEST_USER_EMAILS)),
      db.$count(auditEvents, eq(auditEvents.id, LOCAL_SEED_COMPLETE_AUDIT_ID)),
      db.$count(templates, and(eq(templates.id, OFFICIAL_SEED_TEMPLATE_ID), eq(templates.user_id, "serp-user"))),
      db.$count(account, and(eq(account.id, OFFICIAL_LOGIN_ACCOUNT_ID), eq(account.userId, "serp-user"))),
      db.$count(templates, legacyTestSlugMatch),
    ]);
    return {
      testData: testUsers === TEST_USER_EMAILS.length && marker === 1,
      officialTemplates: officialTemplate === 1,
      officialLogin: officialLogin === 1,
      legacyTestSlugs: legacySlugs > 0,
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
    .insert(entitlementOverrides)
    .values({
      user_id: "serp-user",
      plan: "pro",
      note: "Local official publisher persona: SERP (Pro)",
      created_at: timestamp,
      updated_at: timestamp,
    })
    .onConflictDoUpdate({
      target: entitlementOverrides.user_id,
      set: {
        plan: "pro",
        expires_at: null,
        note: "Local official publisher persona: SERP (Pro)",
        updated_at: timestamp,
      },
    });
}
