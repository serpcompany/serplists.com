import { sql, type SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { jsonObject, readJson } from "../support/readJson";
import { activeRunCapacityAvailableSql } from "../../functions/api/utils/active-run-limit";
import { templateCapacityAvailableSql } from "../../functions/api/utils/template-writes";
import { startLocalD1, type LocalD1 } from "./local-d1-handler-env";

vi.mock("../../functions/api/utils/session", () => ({
  getSessionUserId: vi.fn(),
}));

import { handleAgentMcp } from "../../functions/api/handlers/agentMcp";
import { handleChecklists } from "../../functions/api/handlers/checklists";
import { handleTemplates } from "../../functions/api/handlers/templates";
import { createPersonalRunKeySecret } from "../../functions/api/utils/personal-run-key";
import { getSessionUserId } from "../../functions/api/utils/session";

const PARALLEL = 10;
const now = "2026-09-28T00:00:00.000Z";
const sections = JSON.stringify([{ id: "s1", title: "S", items: [{ id: "i1", title: "Task" }] }]);
const startRunAnswer = z
  .object({
    result: z
      .object({ isError: z.boolean().optional(), structuredContent: z.object({ error: z.string().optional() }).passthrough() })
      .passthrough(),
  })
  .passthrough();
let d1: LocalD1;
let mcpKey = "";

type Handler = (request: Request, env: never) => Promise<Response>;

async function seed() {
  const db = d1.env.DB;
  const users = ["runs", "org-owner", "org-member", "restore", "mcp", "tpl", "tpl-restore", "author"];
  const run = db.prepare(`
    INSERT INTO checklist_runs (id, user_id, team_id, title, items, status, started_at, created_at, progress,
      template_version, revision, retired_items, deleted_at)
    VALUES (?, ?, ?, 'Run', ?, 'in_progress', ?, ?, 0, 1, 1, '[]', ?)
  `);
  const template = db.prepare(`
    INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
      created_by_user_id, content_version, slug, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'checklist', 'user', NULL, ?, 1, ?, ?)
  `);
  const activeRunsOneBelowEachContextsLimitOf3 = [
    ...["runs", "restore", "mcp"].flatMap((userId) => [1, 2].map((n) => run.bind(`${userId}-active-${n}`, userId, null, sections, now, now, null))),
    run.bind("org-active-1", "org-owner", "org-free", sections, now, now, null),
    run.bind("org-active-2", "org-member", "org-free", sections, now, now, null),
  ];
  await db.batch([
    ...users.map((id) => db.prepare("INSERT INTO users (id, email, name, email_verified, created_at) VALUES (?, ?, ?, 1, ?)")
      .bind(id, `${id}@example.test`, id, now)),
    db.prepare("INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES ('org-free', 'Org', 'org-free', 'org-owner', 'org-owner', ?)").bind(now),
    db.prepare("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES ('m1', 'org-free', 'org-owner', 'owner', 'active', ?)").bind(now),
    db.prepare("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES ('m2', 'org-free', 'org-member', 'runner', 'active', ?)").bind(now),
    ...activeRunsOneBelowEachContextsLimitOf3,
    ...Array.from({ length: 5 }, (_, n) => run.bind(`restore-archived-${n}`, "restore", null, sections, now, now, now)),
    template.bind("mcp-template", "mcp", "MCP SOP", sections, 0, now, "mcp", "mcp-sop", null),
    template.bind("public-source", "author", "Public SOP", sections, 1, now, "author", "public-sop", null),
    ...Array.from({ length: 5 }, (_, n) =>
      template.bind(`archived-template-${n}`, "tpl-restore", `Archived ${n}`, sections, 0, now, "tpl-restore", `archived-${n}`, now)),
  ]);

  const secret = await createPersonalRunKeySecret();
  mcpKey = secret.key;
  await db.prepare(`
    INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at) VALUES ('key-mcp', 'mcp', 'Agent', ?, ?, ?)
  `).bind(secret.keyPrefix, secret.keyHash, now).run();
}

async function burst(userIds: string[], handler: Handler, makeRequest: (index: number) => Request) {
  vi.mocked(getSessionUserId).mockImplementation(async (request: Request) => request.headers.get("x-test-user"));
  const responses = await Promise.all(Array.from({ length: PARALLEL }, (_, index) => {
    const request = makeRequest(index);
    request.headers.set("x-test-user", userIds[index % userIds.length]);
    return handler(request, d1.env as never);
  }));
  const statuses = responses.map((response) => response.status);
  const bodies = await Promise.all(responses.map((response) => readJson(response, jsonObject)));
  return { statuses, bodies };
}

const post = (path: string, body: unknown = {}) =>
  new Request(`http://localhost/api/${path}`, { method: "POST", body: JSON.stringify(body) });

async function scalar(sql: string, ...bindings: unknown[]): Promise<number> {
  const row = await d1.env.DB.prepare(sql).bind(...bindings).first<{ value: number }>();
  return row?.value ?? 0;
}

function expectOneWinner({ statuses, bodies }: { statuses: number[]; bodies: Record<string, unknown>[] }) {
  expect(statuses.filter((status) => status === 200)).toHaveLength(1);
  expect(statuses.filter((status) => status === 403)).toHaveLength(PARALLEL - 1);
  for (const [index, body] of bodies.entries()) {
    if (statuses[index] === 403) expect(body.code).toBe("limit_reached");
  }
}

describe.sequential("Free plan limits under concurrent requests (local D1), checked inside each write so no request passes a count read before the others inserted", () => {
  beforeAll(async () => {
    d1 = await startLocalD1("plan-limits");
    await seed();
  }, 120_000);

  afterAll(async () => {
    await d1?.dispose();
  });

  it("creates only one Personal run past two active runs", async () => {
    expectOneWinner(await burst(["runs"], handleChecklists as Handler, () => post("checklists", { title: "Run", sections: JSON.parse(sections) })));
    expect(await scalar("SELECT count(*) AS value FROM checklist_runs WHERE user_id = 'runs' AND status = 'in_progress' AND deleted_at IS NULL")).toBe(3);
    expect(await scalar("SELECT count(*) AS value FROM audit_events WHERE subject_id = 'runs' AND action = 'checklist_run.created'")).toBe(1);
  });

  it("creates only one Organization run when members start runs together", async () => {
    expectOneWinner(await burst(["org-owner", "org-member"], handleChecklists as Handler, () =>
      post("checklists", { teamId: "org-free", title: "Run", sections: JSON.parse(sections) })));
    expect(await scalar("SELECT count(*) AS value FROM checklist_runs WHERE team_id = 'org-free' AND status = 'in_progress' AND deleted_at IS NULL")).toBe(3);
  });

  it("restores only one archived in-progress run", async () => {
    const { statuses } = await burst(["restore"], handleChecklists as Handler, (index) => post(`checklists/restore-archived-${index % 5}/restore`));
    expect(statuses.filter((status) => status === 403).length).toBeGreaterThanOrEqual(4);
    expect(await scalar("SELECT count(*) AS value FROM checklist_runs WHERE user_id = 'restore' AND status = 'in_progress' AND deleted_at IS NULL")).toBe(3);
    expect(await scalar("SELECT count(*) AS value FROM audit_events WHERE subject_id = 'restore' AND action = 'checklist_run.restored'")).toBe(1);
  });

  it("starts only one run through MCP", async () => {
    const responses = await Promise.all(Array.from({ length: PARALLEL }, (_, index) => handleAgentMcp(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mcpKey}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: index + 1, method: "tools/call", params: { name: "start_run", arguments: { templateId: "mcp-template" } } }),
    }), d1.env as never)));
    const payloads = await Promise.all(responses.map(async (response) => (await readJson(response, startRunAnswer)).result));
    expect(payloads.filter((payload) => !payload.isError)).toHaveLength(1);
    expect(payloads.filter((payload) => payload.structuredContent.error === "limit_reached")).toHaveLength(PARALLEL - 1);
    expect(await scalar("SELECT count(*) AS value FROM checklist_runs WHERE user_id = 'mcp' AND status = 'in_progress' AND deleted_at IS NULL")).toBe(3);
  });

  it("creates only one template, with one version and one audit row", async () => {
    expectOneWinner(await burst(["tpl"], handleTemplates as Handler, (index) => post("templates", { title: `Template ${index}`, sections: JSON.parse(sections) })));
    expect(await scalar("SELECT count(*) AS value FROM templates WHERE user_id = 'tpl' AND deleted_at IS NULL")).toBe(1);
    expect(await scalar("SELECT count(*) AS value FROM template_versions WHERE changed_by_user_id = 'tpl'")).toBe(1);
    expect(await scalar("SELECT count(*) AS value FROM audit_events WHERE actor_user_id = 'tpl' AND action = 'template.created'")).toBe(1);
  });

  it("clones only one template into a Free Organization, the one copy target a Free template limit applies to", async () => {
    expectOneWinner(await burst(["org-owner"], handleTemplates as Handler, () => post("templates/public-source/clone", { teamId: "org-free" })));
    expect(await scalar("SELECT count(*) AS value FROM templates WHERE team_id = 'org-free' AND deleted_at IS NULL")).toBe(1);
    expect(await scalar("SELECT count(*) AS value FROM template_versions WHERE template_id IN (SELECT id FROM templates WHERE team_id = 'org-free')")).toBe(1);
  });

  it("keeps the in-write limit checks on indexed lookups", async () => {
    const plan = async (condition: SQL) => {
      const query = new SQLiteSyncDialect().sqlToQuery(sql`select ${condition}`);
      const rows = await d1.env.DB.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).bind(...query.params).all<{ detail: string }>();
      return rows.results.map(({ detail }) => detail);
    };
    const checks = [
      activeRunCapacityAvailableSql({ userId: "runs", teamId: null }, 3),
      activeRunCapacityAvailableSql({ userId: "org-owner", teamId: "org-free" }, 3),
      templateCapacityAvailableSql({ owner: { userId: "tpl", teamId: null }, limit: 1 }),
      templateCapacityAvailableSql({ owner: { userId: "tpl", teamId: "org-free" }, limit: 1 }),
    ];
    for (const condition of checks) {
      const steps = await plan(condition);
      expect(steps.some((detail) => /^SEARCH (checklist_runs|templates) USING (COVERING )?INDEX /.test(detail)), steps.join("; ")).toBe(true);
      expect(steps.some((detail) => /^SCAN (checklist_runs|templates)\b/.test(detail)), steps.join("; ")).toBe(false);
    }
  });

  it("restores only one archived template", async () => {
    const { statuses } = await burst(["tpl-restore"], handleTemplates as Handler, (index) => post(`templates/archived-template-${index % 5}/restore`));
    expect(statuses.filter((status) => status === 403).length).toBeGreaterThanOrEqual(4);
    expect(await scalar("SELECT count(*) AS value FROM templates WHERE user_id = 'tpl-restore' AND deleted_at IS NULL")).toBe(1);
    expect(await scalar("SELECT count(*) AS value FROM audit_events WHERE actor_user_id = 'tpl-restore' AND action = 'template.restored'")).toBe(1);
  });
});
