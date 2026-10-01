import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema } from "../../functions/api/db";
import { rowExistsSql } from "../../functions/api/utils/guarded-insert";
import { startLocalD1, type LocalD1 } from "./local-d1-handler-env";

vi.mock("../../functions/api/utils/session", () => ({
  getSessionUserId: vi.fn(),
}));

import { handleChecklists } from "../../functions/api/handlers/checklists";
import { handleTemplates } from "../../functions/api/handlers/templates";
import { getSessionUserId } from "../../functions/api/utils/session";

type Handler = (request: Request, env: never) => Promise<Response>;

const PARALLEL = 6;
const now = "2026-09-28T00:00:00.000Z";
const runItems = JSON.stringify([{ id: "s1", title: "S", items: [{ id: "i1", title: "Task" }, { id: "i2", title: "Other" }] }]);
let d1: LocalD1;

async function seed() {
  const db = d1.env.DB;
  const run = db.prepare(`
    INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, created_at, progress,
      template_version, revision, retired_items, is_public, share_token, deleted_at)
    VALUES (?, 'owner', NULL, ?, 'Run', ?, 'in_progress', ?, ?, 0, 1, 7, '[]', ?, ?, ?)
  `);
  const template = db.prepare(`
    INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
      created_by_user_id, content_version, deleted_at)
    VALUES (?, 'owner', 'Template', ?, 0, ?, 3, 'checklist', 'user', NULL, 'owner', ?, ?)
  `);
  const proOverrideSoRestoresNeverMeetTheFreeLimits =
    db.prepare("INSERT INTO entitlement_overrides (user_id, plan, note, created_at, updated_at) VALUES ('owner', 'pro', 'test', ?, ?)").bind(now, now);
  await db.batch([
    db.prepare("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('owner', 'owner@example.test', 'Owner', 1, ?)").bind(now),
    proOverrideSoRestoresNeverMeetTheFreeLimits,
    template.bind("template-source", runItems, now, 2, null),
    template.bind("template-put", runItems, now, 1, null),
    template.bind("template-archive", runItems, now, 1, null),
    template.bind("template-restore", runItems, now, 1, now),
    run.bind("run-put", null, runItems, now, now, 0, null, null),
    run.bind("run-template-put", "template-put", runItems, now, now, 0, null, null),
    run.bind("run-shared", null, runItems, now, now, 1, "share-token", null),
    run.bind("run-revalidate", "template-source", runItems, now, now, 0, null, null),
    run.bind("run-archive", null, runItems, now, now, 0, null, null),
    run.bind("run-restore", null, runItems, now, now, 0, null, now),
  ]);
}

async function burst(handler: Handler, makeRequest: (index: number) => Request) {
  vi.mocked(getSessionUserId).mockImplementation(async (request: Request) => request.headers.get("x-test-user"));
  const responses = await Promise.all(Array.from({ length: PARALLEL }, (_, index) => {
    const request = makeRequest(index);
    request.headers.set("x-test-user", "owner");
    return handler(request, d1.env as never);
  }));
  return responses.map((response) => response.status);
}

const request = (path: string, method: string, body?: unknown) =>
  new Request(`http://localhost/api/${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

function envWhoseNextBatchFollowsAConcurrentWrite(statement: string): never {
  const db = d1.env.DB;
  let fired = false;
  const racing = new Proxy(db, {
    get(target, property) {
      if (property === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          if (!fired) {
            fired = true;
            await target.prepare(statement).run();
          }
          return target.batch(statements);
        };
      }
      const value = Reflect.get(target, property) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ...d1.env, DB: racing } as never;
}

async function auditCount(resourceId: string, action: string): Promise<number> {
  const row = await d1.env.DB.prepare("SELECT count(*) AS value FROM audit_events WHERE resource_id = ? AND action = ?")
    .bind(resourceId, action).first<{ value: number }>();
  return row?.value ?? 0;
}

function expectOneSuccess(statuses: number[], loserStatus: number) {
  expect(statuses.filter((status) => status === 200)).toHaveLength(1);
  expect(statuses.filter((status) => status === loserStatus)).toHaveLength(PARALLEL - 1);
}

describe.sequential("audit rows under concurrent writes (local D1), recorded only for the request whose guarded write lands", () => {
  beforeAll(async () => {
    d1 = await startLocalD1("audit-guards");
    await seed();
  }, 120_000);

  afterAll(async () => {
    await d1?.dispose();
  });

  it("run PUT: one save wins and only it is in history", async () => {
    const statuses = await burst(handleChecklists as Handler, (index) =>
      request("checklists/run-put", "PUT", { title: `Title ${index}`, expected_revision: 7 }));
    expectOneSuccess(statuses, 409);
    expect(await auditCount("run-put", "checklist_run.updated")).toBe(1);
  });

  it("share-link PUT: one save wins and only it is in history", async () => {
    const sections = JSON.parse(runItems);
    sections[0].items[0].isCompleted = true;
    const statuses = await burst(handleChecklists as Handler, () =>
      request("checklists/shared/share-token", "PUT", { sections, expected_revision: 7 }));
    expectOneSuccess(statuses, 409);
    expect(await auditCount("run-shared", "checklist_run.shared_updated")).toBe(1);
  });

  it("revalidate: one request wins and only it is in history", async () => {
    const statuses = await burst(handleChecklists as Handler, () =>
      request("checklists/run-revalidate/revalidate", "POST", { expected_revision: 7 }));
    expectOneSuccess(statuses, 409);
    expect(await auditCount("run-revalidate", "checklist_run.revalidated")).toBe(1);
  });

  it("run archive and restore: one request each succeeds and is recorded", async () => {
    expectOneSuccess(await burst(handleChecklists as Handler, () => request("checklists/run-archive", "DELETE")), 404);
    expect(await auditCount("run-archive", "checklist_run.deleted")).toBe(1);

    expectOneSuccess(await burst(handleChecklists as Handler, () => request("checklists/run-restore/restore", "POST")), 400);
    expect(await auditCount("run-restore", "checklist_run.restored")).toBe(1);
  });

  it("template PUT: a save that loses to a concurrent version bump writes nothing, not even a content save's run reconciliation", async () => {
    vi.mocked(getSessionUserId).mockResolvedValue("owner");
    const bump = "UPDATE templates SET version = version + 1 WHERE id = 'template-put'";
    const visibility = await handleTemplates(request("templates/template-put", "PUT", { is_public: true, expected_version: 3 }), envWhoseNextBatchFollowsAConcurrentWrite(bump));
    expect(visibility.status).toBe(409);

    const contentSaveThatWouldAlsoReconcileRuns = await handleTemplates(request("templates/template-put", "PUT", {
      expected_version: 4,
      sections: [{ id: "s1", title: "S", items: [{ id: "i1", title: "Task" }, { id: "i9", title: "Lost" }] }],
    }), envWhoseNextBatchFollowsAConcurrentWrite(bump));
    expect(contentSaveThatWouldAlsoReconcileRuns.status).toBe(409);

    expect(await auditCount("template-put", "template.updated")).toBe(0);
    const versions = await d1.env.DB.prepare("SELECT count(*) AS value FROM template_versions WHERE template_id = 'template-put'")
      .first<{ value: number }>();
    expect(versions?.value).toBe(0);
    const linkedRun = await d1.env.DB.prepare("SELECT items, revision FROM checklist_runs WHERE id = 'run-template-put'")
      .first<{ items: string; revision: number }>();
    expect(linkedRun).toEqual({ items: runItems, revision: 7 });
  });

  it("template content PUT still versions the template and reconciles its runs", async () => {
    vi.mocked(getSessionUserId).mockResolvedValue("owner");
    const current = await d1.env.DB.prepare("SELECT version FROM templates WHERE id = 'template-source'").first<{ version: number }>();
    const response = await handleTemplates(request("templates/template-source", "PUT", {
      expected_version: current?.version,
      sections: [{ id: "s1", title: "S", items: [{ id: "i1", title: "Task" }, { id: "i3", title: "Added" }] }],
    }), d1.env as never);

    expect(response.status).toBe(200);
    expect(await auditCount("template-source", "template.updated")).toBe(1);
    const reconciled = await d1.env.DB.prepare("SELECT items, revision FROM checklist_runs WHERE id = 'run-revalidate'")
      .first<{ items: string; revision: number }>();
    expect(reconciled?.items).toContain("Added");
  });

  it("template archive and restore: one request each succeeds and is recorded", async () => {
    expectOneSuccess(await burst(handleTemplates as Handler, () => request("templates/template-archive", "DELETE")), 404);
    expect(await auditCount("template-archive", "template.deleted")).toBe(1);

    expectOneSuccess(await burst(handleTemplates as Handler, () => request("templates/template-restore/restore", "POST")), 400);
    expect(await auditCount("template-restore", "template.restored")).toBe(1);
  });

  it("keeps the audit guards and the share-link actor lookup on indexed reads", async () => {
    const { checklist_runs, team_members, templates } = schema;
    const plan = async (query: SQL) => {
      const compiled = new SQLiteSyncDialect().sqlToQuery(query);
      const rows = await d1.env.DB.prepare(`EXPLAIN QUERY PLAN ${compiled.sql}`).bind(...compiled.params).all<{ detail: string }>();
      return rows.results.map(({ detail }) => detail);
    };
    const queries = [
      sql`select ${rowExistsSql(checklist_runs.id, "run-put", and(eq(checklist_runs.revision, 7), isNull(checklist_runs.deleted_at)))}`,
      sql`select exists (select 1 from ${templates} where ${and(eq(templates.id, "template-put"), eq(templates.version, 3))})`,
      sql`select ${team_members.user_id} from ${team_members} where ${and(eq(team_members.team_id, "org"), inArray(team_members.user_id, ["a", "b"]))}`,
    ];
    for (const query of queries) {
      const steps = await plan(query);
      expect(steps.some((detail) => /^SEARCH /.test(detail)), steps.join("; ")).toBe(true);
      expect(steps.some((detail) => /^SCAN (checklist_runs|templates|team_members)( |$)/.test(detail)), steps.join("; ")).toBe(false);
    }
  });
});
