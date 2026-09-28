import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startLocalD1, type LocalD1 } from "./local-d1-handler-env";

// Against real local D1: stopping a share turns the link off for guests, writes exactly one
// audit event, and lets a shared run that went stale be revalidated again.

vi.mock("../../functions/api/utils/session", () => ({
  getSessionUserId: vi.fn(),
}));

import { handleChecklists } from "../../functions/api/handlers/checklists";
import { getSessionUserId } from "../../functions/api/utils/session";

let d1: LocalD1;
const now = "2026-09-28T00:00:00.000Z";
const runItems = JSON.stringify([{ id: "s1", title: "S", items: [{ id: "i1", title: "Old step", isCompleted: true }] }]);
const templateItems = JSON.stringify([{ id: "s1", title: "S", items: [{ id: "i1", title: "Old step" }, { id: "i2", title: "New step" }] }]);

async function seed() {
  const db = d1.env.DB;
  await db.batch([
    db.prepare("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('owner', 'owner@example.test', 'Owner', 1, ?)").bind(now),
    db.prepare(`
      INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
        created_by_user_id, content_version)
      VALUES ('template-1', 'owner', 'SOP', ?, 0, ?, 2, 'checklist', 'user', NULL, 'owner', 2)
    `).bind(templateItems, now),
    // The template moved to content version 2 while the run was shared, so the run is stale.
    db.prepare(`
      INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, created_at,
        progress, template_version, revision, retired_items, is_public)
      VALUES ('run-1', 'owner', NULL, 'template-1', 'Run', ?, 'in_progress', ?, ?, 100, 1, 1, '[]', 0)
    `).bind(runItems, now, now),
  ]);
}

async function call(path: string, method: string, userId: string | null, body?: unknown) {
  vi.mocked(getSessionUserId).mockResolvedValue(userId);
  const response = await handleChecklists(new Request(`http://localhost/api/checklists/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), d1.env as never);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

async function auditActions(): Promise<string[]> {
  const { results } = await d1.env.DB.prepare("SELECT action FROM audit_events WHERE resource_id = 'run-1' ORDER BY created_at, action")
    .all<{ action: string }>();
  return results.map((row) => row.action);
}

describe.sequential("stopping a run share against local D1", () => {
  beforeAll(async () => {
    d1 = await startLocalD1("run-share-revoke");
    await seed();
  }, 120_000);

  afterAll(async () => {
    await d1?.dispose();
  });

  it("turns the link off, keeps the run's progress, and allows revalidation again", async () => {
    const share = await call("run/run-1/share", "POST", "owner", {});
    expect(share.status).toBe(200);
    const token = share.body.shareToken as string;
    expect((await call(`shared/${token}`, "GET", null)).status).toBe(200);
    expect((await call("run-1/revalidate", "POST", "owner", { expected_revision: 1 })).body.code).toBe("shared_run_conflict");

    const revoke = await call("run/run-1/share", "DELETE", "owner");
    expect(revoke).toEqual({ status: 200, body: { id: "run-1", isPublic: false } });

    expect((await call(`shared/${token}`, "GET", null)).status).toBe(404);
    expect((await call(`shared/${token}`, "PUT", null, { expected_revision: 1, status: "completed" })).status).toBe(404);
    const stored = await d1.env.DB.prepare("SELECT * FROM checklist_runs WHERE id = 'run-1'").first<Record<string, unknown>>();
    expect(stored).toEqual(expect.objectContaining({
      is_public: 0, share_token: null, share_expires_at: null, share_used_at: null, revision: 1, items: runItems,
    }));

    // Stopping again changes nothing and records nothing.
    expect((await call("run/run-1/share", "DELETE", "owner")).status).toBe(200);
    expect(await auditActions()).toEqual(["checklist_run.share_created", "checklist_run.share_revoked"]);

    const listed = await call("run-1", "GET", "owner");
    expect(listed.body).toEqual(expect.objectContaining({ is_public: false, is_stale: true }));
    const revalidated = await call("run-1/revalidate", "POST", "owner", { expected_revision: 1 });
    expect(revalidated.status).toBe(200);
    expect(revalidated.body.template_version).toBe(2);
  });
});
