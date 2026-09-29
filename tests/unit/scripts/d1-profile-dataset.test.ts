import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";

import * as schema from "../../../db/schema/index";
import { seedLocalTestData } from "../../../db/seeds/local";
import { buildSyntheticSql, type DatasetCounts } from "../../../scripts/d1-profile-dataset";
import {
  buildUpdateTemplateBody,
  currentResourceSchema,
  scenarios,
  UPDATE_TEMPLATE,
} from "../../../scripts/d1-profile-lib";
import type { LocalDb } from "../../../scripts/data/local-d1";
import { SqliteD1 } from "../../support/sqlite-d1";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: vi.fn(async () => session.userId) }));

import { handleTemplates } from "@functions/api/handlers/templates";

// pnpm run d1:profile builds its dataset on the migrations and the local seed, then saves
// the scripted template updates. A template save writes history at version + 1, so a
// synthetic template whose history is ahead of its version answers 409, and the profile
// fails and measures the rolled-back error path instead of the save.

const small: DatasetCounts = {
  users: 200,
  teams: 10,
  templates: 100,
  runs: 100,
  likes: 50,
  auditEvents: 50,
  invites: 20,
  templateVersions: 100,
  analytics: 20,
};

async function buildDataset(counts: DatasetCounts) {
  const d1 = new SqliteD1();
  await seedLocalTestData(drizzle(d1.binding, { schema }) as unknown as LocalDb);
  d1.sqlite.exec(buildSyntheticSql(counts));
  return d1;
}

const updateTemplatePaths = scenarios()
  .filter((scenario) => scenario.body === UPDATE_TEMPLATE)
  .map((scenario) => scenario.path);

describe("d1:profile synthetic dataset", () => {
  // The profile always builds as many general version rows as templates (datasetCounts).
  it.each([
    ["small", small],
    ["doubled", Object.fromEntries(Object.entries(small).map(([key, count]) => [key, count * 2])) as DatasetCounts],
  ])("keeps every template's version at its newest history row (%s)", async (_label, counts) => {
    const d1 = await buildDataset(counts);

    expect(d1.rows(`
      SELECT t.id, t.version, MAX(v.version) AS newest FROM templates t
      JOIN template_versions v ON v.template_id = t.id
      GROUP BY t.id HAVING t.version < MAX(v.version)
    `)).toEqual([]);
  });

  it.each(updateTemplatePaths)("saves the profiled update of %s", async (path) => {
    const d1 = await buildDataset(small);
    const env = { DB: d1.binding, BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" } as never;
    session.userId = "user-1";

    const current = await handleTemplates(new Request(`http://localhost${path}`), env);
    expect(current.status).toBe(200);
    const body = buildUpdateTemplateBody(currentResourceSchema.parse(await current.json()), "test");

    const response = await handleTemplates(new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env);
    expect(response.status, await response.clone().text()).toBe(200);
  });
});
