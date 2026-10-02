import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it, vi } from "vitest";

import * as schema from "../../../db/schema/index";
import { seedLocalTestData } from "../../../db/seeds/local";
import { buildSyntheticSql, datasetCounts, type DatasetCounts } from "../../../scripts/d1-profile-dataset";
import {
  adminRun,
  buildUpdateTemplateBody,
  currentResourceSchema,
  organizationTemplate,
  personalTemplate,
  publicTemplateOwner,
  publicTemplateSlug,
  scenarios,
  UPDATE_TEMPLATE,
} from "../../../scripts/d1-profile-lib";
import { SqliteD1 } from "../../support/sqlite-d1";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: vi.fn(async () => session.userId) }));

import { handleChecklists } from "@functions/api/handlers/checklists";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnv } from "../../support/apiEnv";

const smallTemplateCount = 100;
const doubled = (counts: DatasetCounts): DatasetCounts => ({
  users: counts.users * 2,
  teams: counts.teams * 2,
  templates: counts.templates * 2,
  runs: counts.runs * 2,
  likes: counts.likes * 2,
  auditEvents: counts.auditEvents * 2,
  invites: counts.invites * 2,
  templateVersions: counts.templateVersions * 2,
  analytics: counts.analytics * 2,
});

const small: DatasetCounts = {
  users: 200,
  teams: 10,
  templates: smallTemplateCount,
  runs: 100,
  likes: 50,
  auditEvents: 50,
  invites: 20,
  templateVersions: smallTemplateCount,
  analytics: 20,
};
const env = (d1: SqliteD1) => apiEnv({ DB: d1.binding, BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" });

async function buildDataset(counts: DatasetCounts) {
  const d1 = new SqliteD1();
  await seedLocalTestData(drizzle(d1.binding, { schema }));
  d1.sqlite.exec(buildSyntheticSql(counts));
  return d1;
}

const updateTemplatePaths = scenarios()
  .filter((scenario) => scenario.body === UPDATE_TEMPLATE)
  .map((scenario) => scenario.path);

describe("d1:profile synthetic dataset", () => {
  it.each([1, 3])("builds one general history row per template at scale %i, as the small datasets here do", (scale) => {
    expect(datasetCounts(scale).templateVersions).toBe(datasetCounts(scale).templates);
  });

  it.each([
    ["small", small],
    ["doubled", doubled(small)],
  ])("keeps every template's version at its newest history row, since a save writes history at version + 1 (%s)", async (_label, counts) => {
    const d1 = await buildDataset(counts);

    expect(d1.rows(`
      SELECT t.id, t.version, MAX(v.version) AS newest FROM templates t
      JOIN template_versions v ON v.template_id = t.id
      GROUP BY t.id HAVING t.version < MAX(v.version)
    `)).toEqual([]);
  });

  it.each(updateTemplatePaths)("saves the profiled update of %s", async (path) => {
    const d1 = await buildDataset(small);
    session.userId = "user-1";

    const current = await handleTemplates(new Request(`http://localhost${path}`), env(d1));
    expect(current.status).toBe(200);
    const body = buildUpdateTemplateBody(currentResourceSchema.parse(await current.json()), "test");

    const response = await handleTemplates(new Request(`http://localhost${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), env(d1));
    expect(response.status, await response.clone().text()).toBe(200);
  });

  it("holds the rows the scenarios name: admin's public template with 301 versions, the seeded Organization's private one, synth_6's public one and admin's run", async () => {
    const d1 = await buildDataset(small);

    expect(d1.rows("SELECT user_id, owner_type, team_id, is_public FROM templates WHERE id = ?", personalTemplate)).toEqual([
      { user_id: "user-1", owner_type: "user", team_id: null, is_public: 1 },
    ]);
    expect(d1.rows("SELECT COUNT(*) AS versions FROM template_versions WHERE template_id = ?", personalTemplate)).toEqual([
      { versions: 301 },
    ]);
    expect(d1.rows("SELECT owner_type, team_id, is_public FROM templates WHERE id = ?", organizationTemplate)).toEqual([
      { owner_type: "team", team_id: "team-seed-growth", is_public: 0 },
    ]);
    expect(
      d1.rows(
        "SELECT t.slug, t.is_public, u.username FROM templates t JOIN users u ON u.id = t.user_id WHERE t.id = ?",
        publicTemplateSlug,
      ),
    ).toEqual([{ slug: publicTemplateSlug, is_public: 1, username: publicTemplateOwner }]);
    expect(d1.rows("SELECT user_id FROM checklist_runs WHERE id = ?", adminRun)).toEqual([{ user_id: "user-1" }]);
  });

  it("starts john's run on the Free plan, since the dataset leaves him under its active run limit", async () => {
    const d1 = await buildDataset(small);
    const freePlanStart = scenarios().find((scenario) => scenario.actor === "john" && scenario.method === "POST");
    session.userId = "user-2";

    const response = await handleChecklists(new Request(`http://localhost${freePlanStart?.path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(freePlanStart?.body),
    }), env(d1));
    expect(response.status, await response.clone().text()).toBe(freePlanStart?.expectedStatus);
  });
});
