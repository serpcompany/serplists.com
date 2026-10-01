import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonObject, readJson } from "../../../support/readJson";
import { SqliteD1 } from "../../../support/sqlite-d1";

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@functions/api/utils/session", () => sessionMocks);

import { handleChecklists } from "@functions/api/handlers/checklists";
import { handleTemplates } from "@functions/api/handlers/templates";

const NOW = "2026-09-28T00:00:00.000Z";
const ITEMS = JSON.stringify([{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task" }] }]);

describe("restore of an item that is not archived, on the migrated tables", () => {
  let database: SqliteD1;
  const env = () => ({ DB: database.binding, BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" }) as never;

  const exec = (query: string, ...params: Array<string | number | null>) =>
    database.sqlite.prepare(query).run(...params);

  const post = async (handler: typeof handleTemplates, path: string) => {
    const response = await handler(new Request(`http://localhost/api/${path}`, { method: "POST" }), env());
    return { status: response.status, body: await readJson(response, jsonObject) };
  };

  const auditCount = (action: string) =>
    (database.sqlite.prepare("SELECT count(*) AS value FROM audit_events WHERE action = ?").get(action) as { value: number }).value;

  beforeEach(() => {
    database = new SqliteD1();
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
    exec("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-1', 'user-1@example.test', 'User', 1, ?)", NOW);
    exec(
      `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
        created_by_user_id, content_version, deleted_at)
       VALUES ('template-1', 'user-1', 'Template', ?, 0, ?, 1, 'checklist', 'user', NULL, 'user-1', 1, NULL)`,
      ITEMS, NOW,
    );
    exec(
      `INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, created_at,
        progress, created_by_user_id, started_by_user_id, template_version, revision, retired_items, is_public, deleted_at)
       VALUES ('run-1', 'user-1', NULL, 'template-1', 'Run', ?, 'in_progress', ?, ?, 0, 'user-1', 'user-1', 1, 1, '[]', 0, NULL)`,
      ITEMS, NOW, NOW,
    );
  });

  afterEach(() => {
    database.sqlite.close();
  });

  it("answers a Template restored elsewhere with code not_archived and records nothing", async () => {
    await expect(post(handleTemplates, "templates/template-1/restore")).resolves.toEqual({
      status: 400,
      body: expect.objectContaining({ error: "Template is not archived", code: "not_archived" }),
    });
    expect(auditCount("template.restored")).toBe(0);
  });

  it("answers a Run restored elsewhere with code not_archived and records nothing", async () => {
    await expect(post(handleChecklists, "checklists/run-1/restore")).resolves.toEqual({
      status: 400,
      body: expect.objectContaining({ error: "Checklist is not archived", code: "not_archived" }),
    });
    expect(auditCount("checklist_run.restored")).toBe(0);
  });

  it("restores an archived Template and Run once, then says the second restore found them live", async () => {
    exec("UPDATE templates SET deleted_at = ? WHERE id = 'template-1'", NOW);
    exec("UPDATE checklist_runs SET deleted_at = ? WHERE id = 'run-1'", NOW);

    expect((await post(handleTemplates, "templates/template-1/restore")).status).toBe(200);
    expect((await post(handleChecklists, "checklists/run-1/restore")).status).toBe(200);
    expect((await post(handleTemplates, "templates/template-1/restore")).body.code).toBe("not_archived");
    expect((await post(handleChecklists, "checklists/run-1/restore")).body.code).toBe("not_archived");
  });
});
