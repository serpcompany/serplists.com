import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonObject, readJson } from "../../../support/readJson";
import { SqliteD1 } from "../../../support/sqlite-d1";

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@functions/api/utils/session", () => sessionMocks);

import { handleChecklists } from "@functions/api/handlers/checklists";

const NOW = "2026-09-28T00:00:00.000Z";
const RUN_ITEMS = JSON.stringify([{ id: "s1", title: "Public", items: [{ id: "i1", title: "Public step", isCompleted: true }] }]);
const TEMPLATE_ITEMS = JSON.stringify([{ id: "s1", title: "Private", items: [{ id: "i1", title: "Confidential step" }] }]);

describe("revalidate refusals on the migrated tables, which tell a gone run from a source the caller may no longer use", () => {
  let database: SqliteD1;

  const exec = (query: string, ...params: Array<string | number | null>) =>
    database.sqlite.prepare(query).run(...params);

  const addTemplate = (
    id: string,
    { userId = "user-a", isPublic = 1, ownerType = "user", teamId = null as string | null, deletedAt = null as string | null } = {},
  ) =>
    exec(
      `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
        created_by_user_id, content_version, deleted_at)
       VALUES (?, ?, 'Template', ?, ?, ?, 1, 'checklist', ?, ?, ?, 2, ?)`,
      id, userId, TEMPLATE_ITEMS, isPublic, NOW, ownerType, teamId, userId, deletedAt,
    );

  const addRun = (id: string, templateId: string, { userId = "user-b", teamId = null as string | null, deletedAt = null as string | null } = {}) =>
    exec(
      `INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, created_at,
        progress, created_by_user_id, started_by_user_id, template_version, revision, retired_items, is_public, deleted_at)
       VALUES (?, ?, ?, ?, 'Run', ?, 'in_progress', ?, ?, 100, ?, ?, 1, 1, '[]', 0, ?)`,
      id, userId, teamId, templateId, RUN_ITEMS, NOW, NOW, userId, userId, deletedAt,
    );

  const revalidateAs = async (userId: string, runId: string) => {
    sessionMocks.getSessionUserId.mockResolvedValue(userId);
    const response = await handleChecklists(
      new Request(`http://localhost/api/checklists/${runId}/revalidate`, {
        method: "POST",
        body: JSON.stringify({ expected_revision: 1 }),
      }),
      { DB: database.binding, BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" } as never,
    );
    return { status: response.status, body: await readJson(response, jsonObject) };
  };

  const storedItems = (runId: string) =>
    (database.sqlite.prepare("SELECT items FROM checklist_runs WHERE id = ?").get(runId) as { items: string }).items;

  beforeEach(() => {
    database = new SqliteD1();
    for (const id of ["user-a", "user-b"]) {
      exec("INSERT INTO users (id, email, name, email_verified, created_at) VALUES (?, ?, ?, 1, ?)", id, `${id}@example.test`, id, NOW);
    }
    for (const org of ["org-1", "org-2"]) {
      exec(
        "INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES (?, ?, ?, 'user-a', 'user-a', ?)",
        org, org, org, NOW,
      );
      exec(
        "INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES (?, ?, 'user-a', 'owner', 'active', ?)",
        `${org}-a`, org, NOW,
      );
    }
    exec("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES ('org-1-b', 'org-1', 'user-b', 'runner', 'active', ?)", NOW);
  });

  afterEach(() => {
    database.sqlite.close();
  });

  it.each([
    ["made private by its owner", "t-private", { isPublic: 0 }, {}],
    ["archived", "t-archived", { deletedAt: NOW }, {}],
    ["another Organization's template", "t-org-2", { isPublic: 0, ownerType: "team", teamId: "org-2" }, { teamId: "org-1" }],
  ])("marks a source template that was %s as unavailable, not the run", async (_label, templateId, template, run) => {
    addTemplate(templateId, template);
    addRun("run-1", templateId, run);

    const { status, body } = await revalidateAs("user-b", "run-1");

    expect(status).toBe(404);
    expect(body).toEqual(expect.objectContaining({ error: "Source template not found", code: "source_template_unavailable" }));
    expect(JSON.stringify(body)).not.toContain("Confidential");
    expect(storedItems("run-1")).toBe(RUN_ITEMS);
  });

  it("gives a missing or archived run a plain 404 with no code", async () => {
    addTemplate("t-public");
    addRun("run-archived", "t-public", { deletedAt: NOW });

    for (const runId of ["run-missing", "run-archived"]) {
      const { status, body } = await revalidateAs("user-b", runId);
      expect(status).toBe(404);
      expect(body.error).toBe("Checklist not found");
      expect(body.code).toBeUndefined();
    }
  });

  it("still revalidates from a public template", async () => {
    addTemplate("t-public");
    addRun("run-1", "t-public");

    const { status } = await revalidateAs("user-b", "run-1");

    expect(status).toBe(200);
    expect(storedItems("run-1")).toContain("Confidential step");
  });
});
