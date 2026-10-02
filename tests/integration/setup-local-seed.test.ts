import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { LEGACY_TEST_TEMPLATE_SLUGS } from "../../db/seeds/local";
import { account, templates, users } from "../../db/schema/index";
import { withLocalD1, type LocalDb } from "../../scripts/data/local-d1";
import { LOCAL_SEED_STEPS, parseSeedStatus, RESET_SEED_STEPS } from "../../scripts/lib/local-d1-seed.mjs";
import { runLocalD1Setup } from "../../scripts/setup-local-lib.mjs";
import { runToolInRepo } from "./local-d1-handler-env";

const persistPath = mkdtempSync(path.join(tmpdir(), "serplists-setup-seed-"));
const legacyPersistPath = mkdtempSync(path.join(tmpdir(), "serplists-setup-legacy-"));
const DEVELOPER_TEMPLATE_ID = "developer-made-template";

function tool(name: "tsx" | "wrangler", args: string[], persist = persistPath) {
  return runToolInRepo(name, [...args, "--persist-to", persist]);
}

async function insertATemplateJohnMadeWhileDevelopingThatSeedTestWouldDelete(db: LocalDb) {
  await db.insert(templates).values({
    id: DEVELOPER_TEMPLATE_ID,
    user_id: "user-2",
    title: "Made while developing",
    items: "[]",
    slug: DEVELOPER_TEMPLATE_ID,
    created_at: "2026-01-01 00:00:00",
    updated_at: "2026-01-01 00:00:00",
  });
}

function setupSteps(persist = persistPath) {
  const steps: string[] = [];
  const status = runLocalD1Setup({
    stateDirExists: true,
    run: (step: string) => {
      steps.push(step);
      if (step === "migrate") {
        tool("wrangler", ["d1", "migrations", "apply", "serp-checklists-db", "--local"], persist);
        return;
      }
      const seedStep = LOCAL_SEED_STEPS.find((candidate) => candidate.id === step);
      if (!seedStep) throw new Error(`Unexpected setup step ${step}`);
      tool(seedStep.tool, seedStep.args, persist);
    },
    readSeedStatus: () => parseSeedStatus(tool("tsx", ["scripts/data/local-d1-data.ts", "seed-status"], persist)),
  });
  return { steps, status };
}

async function recreateTheStateBeforeSampleSlugs(db: LocalDb) {
  await db
    .delete(templates)
    .where(and(eq(templates.user_id, "serp-user"), inArray(templates.slug, Object.values(LEGACY_TEST_TEMPLATE_SLUGS))));
  for (const [id, slug] of Object.entries(LEGACY_TEST_TEMPLATE_SLUGS)) {
    await db.update(templates).set({ slug }).where(eq(templates.id, id));
  }
}

describe("pnpm run setup on an existing local D1, which seeds what is missing even when migrations already created the state directory", () => {
  afterAll(() => {
    rmSync(persistPath, { recursive: true, force: true });
    rmSync(legacyPersistPath, { recursive: true, force: true });
  });

  it(
    "seeds a migrated but unseeded database, then never resets what is there",
    async () => {
      const unseeded = { testData: false, officialTemplates: false, officialLogin: false, legacyTestSlugs: false };
      const statusBeforeAnyMigrationAsDevApiLeavesIt = parseSeedStatus(tool("tsx", ["scripts/data/local-d1-data.ts", "seed-status"]));
      expect(statusBeforeAnyMigrationAsDevApiLeavesIt).toEqual(unseeded);
      tool("wrangler", ["d1", "migrations", "apply", "serp-checklists-db", "--local"]);
      const statusMigratedButNeverSeeded = parseSeedStatus(tool("tsx", ["scripts/data/local-d1-data.ts", "seed-status"]));
      expect(statusMigratedButNeverSeeded).toEqual(unseeded);

      const first = setupSteps();
      expect(first.steps).toEqual(["migrate", "seed-test", "official-templates", "official-login"]);
      expect(first.status).toEqual({ testData: true, officialTemplates: true, officialLogin: true, legacyTestSlugs: false });

      await withLocalD1(persistPath, async (db) => {
        expect(await db.select({ id: users.id }).from(users).where(eq(users.email, "john@test.com"))).toEqual([{ id: "user-2" }]);
        expect(await db.select({ id: account.id }).from(account).where(eq(account.userId, "serp-user"))).toHaveLength(1);
        await insertATemplateJohnMadeWhileDevelopingThatSeedTestWouldDelete(db);
      });

      expect(setupSteps().steps).toEqual(["migrate"]);

      await withLocalD1(persistPath, async (db) => {
        await db.delete(account).where(and(eq(account.userId, "serp-user"), eq(account.providerId, "credential")));
      });
      expect(setupSteps().steps).toEqual(["migrate", "official-login"]);

      await withLocalD1(persistPath, async (db) => {
        expect(await db.select({ id: templates.id }).from(templates).where(eq(templates.id, DEVELOPER_TEMPLATE_ID))).toHaveLength(1);
      });
    },
    180_000,
  );

  it(
    "repairs a database seeded before the sample- test slugs without reseeding test data",
    async () => {
      const persist = legacyPersistPath;
      tool("wrangler", ["d1", "migrations", "apply", "serp-checklists-db", "--local"], persist);
      for (const step of RESET_SEED_STEPS) tool(step.tool, step.args, persist);
      const officialIds = await withLocalD1(persist, async (db) => {
        const official = await db.select({ id: templates.id }).from(templates).where(eq(templates.user_id, "serp-user"));
        await recreateTheStateBeforeSampleSlugs(db);
        await insertATemplateJohnMadeWhileDevelopingThatSeedTestWouldDelete(db);
        return official.map((row) => row.id).sort();
      });
      expect(officialIds).toContain("serp-template-technical-seo-audit");

      const first = setupSteps(persist);
      expect(first.steps).toEqual(["migrate", "repair-test-slugs", "official-templates", "official-login"]);
      expect(first.status).toEqual({ testData: true, officialTemplates: true, officialLogin: true, legacyTestSlugs: false });

      await withLocalD1(persist, async (db) => {
        const official = await db.select({ id: templates.id }).from(templates).where(eq(templates.user_id, "serp-user"));
        expect(official.map((row) => row.id).sort()).toEqual(officialIds);
        const testRows = await db
          .select({ id: templates.id, slug: templates.slug })
          .from(templates)
          .where(inArray(templates.id, Object.keys(LEGACY_TEST_TEMPLATE_SLUGS)));
        expect(Object.fromEntries(testRows.map((row) => [row.id, row.slug]))).toEqual(
          Object.fromEntries(Object.entries(LEGACY_TEST_TEMPLATE_SLUGS).map(([id, slug]) => [id, `sample-${slug}`])),
        );
        expect(await db.select({ id: templates.id }).from(templates).where(eq(templates.id, DEVELOPER_TEMPLATE_ID))).toHaveLength(1);
      });

      expect(setupSteps(persist).steps).toEqual(["migrate"]);
    },
    180_000,
  );
});
