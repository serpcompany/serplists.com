import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "../../functions/api/db";
import { checklistRunSelectFor } from "../../functions/api/utils/checklist-runs";
import { startLocalD1, type LocalD1 } from "./local-d1-handler-env";

vi.mock("../../functions/api/utils/session", () => ({
  getSessionUserId: vi.fn(),
}));

import { handleChecklists } from "../../functions/api/handlers/checklists";
import { getSessionUserId } from "../../functions/api/utils/session";

type RunRow = { id: string; is_stale: boolean; items: string };

let d1: LocalD1;
const now = "2026-09-28T00:00:00.000Z";
const oldItems = JSON.stringify([{ id: "s1", title: "Public", items: [{ id: "i1", title: "Public step", isCompleted: true }] }]);
const privateItems = JSON.stringify([{ id: "s1", title: "Private", items: [{ id: "i1", title: "Confidential step" }] }]);

async function seed() {
  const db = d1.env.DB;
  const user = db.prepare("INSERT INTO users (id, email, name, email_verified, created_at) VALUES (?, ?, ?, 1, ?)");
  const template = db.prepare(`
    INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
      created_by_user_id, content_version, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'checklist', ?, ?, ?, 2, ?)
  `);
  const run = db.prepare(`
    INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, created_at,
      progress, created_by_user_id, started_by_user_id, template_version, revision, retired_items, is_public)
    VALUES (?, ?, ?, ?, 'Run', ?, 'in_progress', ?, ?, 100, ?, ?, 1, 1, '[]', 0)
  `);
  const oncePublicNowPrivateWithNewContent = template.bind("t-private", "user-a", "Made private", privateItems, 0, now, "user", null, "user-a", null);
  const archivedPublicTemplate = template.bind("t-archived", "user-a", "Archived", privateItems, 1, now, "user", null, "user-a", now);
  const stillPublicTemplateWhoseRunsMayGoStaleForAnyone = template.bind("t-public", "user-a", "Public", privateItems, 1, now, "user", null, "user-a", null);
  const organizationRunFromAMembersPersonalTemplate = run.bind("org-from-a-personal", "user-a", "org-1", "t-private", oldItems, now, now, "user-a", "user-a");
  await db.batch([
    user.bind("user-a", "a@example.test", "A", now),
    user.bind("user-b", "b@example.test", "B", now),
    db.prepare("INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES ('org-1', 'Org', 'org', 'user-a', 'user-a', ?)").bind(now),
    db.prepare("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES ('m-a', 'org-1', 'user-a', 'owner', 'active', ?)").bind(now),
    db.prepare("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES ('m-b', 'org-1', 'user-b', 'runner', 'active', ?)").bind(now),
    oncePublicNowPrivateWithNewContent,
    archivedPublicTemplate,
    stillPublicTemplateWhoseRunsMayGoStaleForAnyone,
    run.bind("b-from-private", "user-b", null, "t-private", oldItems, now, now, "user-b", "user-b"),
    run.bind("b-from-archived", "user-b", null, "t-archived", oldItems, now, now, "user-b", "user-b"),
    run.bind("b-from-public", "user-b", null, "t-public", oldItems, now, now, "user-b", "user-b"),
    run.bind("a-from-private", "user-a", null, "t-private", oldItems, now, now, "user-a", "user-a"),
    organizationRunFromAMembersPersonalTemplate,
  ]);
}

async function listAs(userId: string, query = ""): Promise<Record<string, RunRow>> {
  vi.mocked(getSessionUserId).mockResolvedValue(userId);
  const response = await handleChecklists(new Request(`http://localhost/api/checklists${query}`), d1.env as never);
  expect(response.status).toBe(200);
  const runs = (await response.json()) as RunRow[];
  return Object.fromEntries(runs.map((run) => [run.id, run]));
}

async function revalidateAs(userId: string, runId: string) {
  vi.mocked(getSessionUserId).mockResolvedValue(userId);
  return handleChecklists(new Request(`http://localhost/api/checklists/${runId}/revalidate`, {
    method: "POST",
    body: JSON.stringify({ expected_revision: 1 }),
  }), d1.env as never);
}

async function storedItems(runId: string): Promise<string> {
  const row = await d1.env.DB.prepare("SELECT items FROM checklist_runs WHERE id = ?").bind(runId).first<{ items: string }>();
  return row?.items ?? "";
}

describe.sequential("run source access against local D1, where a run whose template the caller can no longer use is never stale and never revalidates", () => {
  beforeAll(async () => {
    d1 = await startLocalD1("run-source-access");
    await seed();
  }, 120_000);

  afterAll(async () => {
    await d1?.dispose();
  });

  it("reports staleness only for sources the caller may use", async () => {
    const bRuns = await listAs("user-b");
    expect(bRuns["b-from-private"].is_stale).toBe(false);
    expect(bRuns["b-from-archived"].is_stale).toBe(false);
    expect(bRuns["b-from-public"].is_stale).toBe(true);

    const aRuns = await listAs("user-a");
    expect(aRuns["a-from-private"].is_stale).toBe(true);

    expect((await listAs("user-b", "?teamId=org-1"))["org-from-a-personal"].is_stale).toBe(false);
    expect((await listAs("user-a", "?teamId=org-1"))["org-from-a-personal"].is_stale).toBe(true);
  });

  it("refuses to copy a now-private template into another user's run, keeping the run and naming its source unavailable for the page", async () => {
    const response = await revalidateAs("user-b", "b-from-private");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "source_template_unavailable" });
    expect(await storedItems("b-from-private")).toBe(oldItems);
  });

  it("refuses to revalidate from an archived template, saying the template is unavailable", async () => {
    const response = await revalidateAs("user-b", "b-from-archived");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "source_template_unavailable" });
    expect(await storedItems("b-from-archived")).toBe(oldItems);
  });

  it("refuses to copy a member's Personal template into an Organization run for another member", async () => {
    const response = await revalidateAs("user-b", "org-from-a-personal");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: "source_template_unavailable" });
    expect(await storedItems("org-from-a-personal")).toBe(oldItems);
  });

  it("keeps the staleness lookup a primary-key read on templates", async () => {
    const { checklist_runs } = schema;
    const query = drizzle(d1.env.DB)
      .select(checklistRunSelectFor("user-b"))
      .from(checklist_runs)
      .where(and(eq(checklist_runs.user_id, "user-b"), isNull(checklist_runs.team_id), isNull(checklist_runs.deleted_at)))
      .toSQL();
    const plan = await d1.env.DB.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).bind(...query.params).all<{ detail: string }>();
    const templateSteps = plan.results.map(({ detail }) => detail).filter((detail) => /\btemplates\b/.test(detail));
    expect(templateSteps, JSON.stringify(plan.results)).not.toHaveLength(0);
    for (const detail of templateSteps) expect(detail).toMatch(/^SEARCH templates USING .*\(id=\?\)/);
  });

  it("still revalidates from a public template and from the caller's own template", async () => {
    expect((await revalidateAs("user-b", "b-from-public")).status).toBe(200);
    expect(await storedItems("b-from-public")).toContain("Confidential step");
    expect((await revalidateAs("user-a", "a-from-private")).status).toBe(200);
  });
});
