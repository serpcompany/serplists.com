import { runsOnLocalD1 } from "./local-d1-runs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { valueAt } from "../support/elements";

const actor = z.object({ userId: z.string(), name: z.string().nullable(), username: z.string().nullable() }).nullable();
const listedRuns = z.array(
  z.object({ id: z.string(), provenance: z.object({ origin: z.string(), startedBy: actor }).strict() }).passthrough(),
);
const runWithProvenance = z.object({ id: z.string(), provenance: z.record(z.unknown()) }).passthrough();

const now = "2026-10-01T00:00:00.000Z";
const later = "2026-10-01T00:05:00.000Z";
const items = JSON.stringify([{ id: "s1", title: "Section", items: [{ id: "i1", title: "Step" }] }]);
const alice = { userId: "user-a", name: "Alice Admin", username: "alice" };
const bob = { userId: "user-b", name: "Bob Runner", username: "bob" };

async function seed(db: D1Database) {
  const user = db.prepare("INSERT INTO users (id, email, name, username, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)");
  const run = db.prepare(`
    INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, created_at,
      progress, created_by_user_id, started_by_user_id, assigned_to_user_id, template_version, revision, retired_items, is_public)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 3, 1, '[]', 0)
  `);
  const event = db.prepare(`
    INSERT INTO audit_events (id, actor_user_id, subject_type, subject_id, resource_type, resource_id, action, metadata_json,
      ip_hash, user_agent, created_at)
    VALUES (?, ?, ?, ?, 'checklist_run', ?, ?, ?, 'hash-of-an-ip', 'Agent/1.0', ?)
  `);
  await db.batch([
    user.bind("user-a", "alice@example.test", alice.name, alice.username, now),
    user.bind("user-b", "bob@example.test", bob.name, bob.username, now),
    db.prepare("INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES ('org-1', 'Acme Org', 'acme', 'user-a', 'user-a', ?)").bind(now),
    db.prepare("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES ('m-a', 'org-1', 'user-a', 'owner', 'active', ?)").bind(now),
    db.prepare("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES ('m-b', 'org-1', 'user-b', 'runner', 'active', ?)").bind(now),
    db.prepare(`
      INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id, created_by_user_id, content_version)
      VALUES ('t-private', 'user-a', 'Alice Private Playbook', ?, 0, ?, 1, 'checklist', 'user', NULL, 'user-a', 3)
    `).bind(items, now),
    run.bind("mcp-run", "user-a", null, "t-private", "Agent Run", items, "in_progress", now, now, "user-a", "user-a", null),
    event.bind("e-mcp", "user-a", "user", "user-a", "mcp-run", "checklist_run.created",
      JSON.stringify({ source: "mcp", personalRunKeyId: "key-secret-id", personalRunKeyName: "Codex SOP Runner" }), now),
    event.bind("e-mcp-later", "user-a", "user", "user-a", "mcp-run", "checklist_run.updated", JSON.stringify({ source: "web" }), later),
    run.bind("legacy-run", "user-a", null, null, "Old Run", items, "completed", now, now, "user-a", "user-a", null),
    event.bind("e-legacy", "user-a", "user", "user-a", "legacy-run", "checklist_run.created", null, now),
    run.bind("bare-run", "user-a", null, null, "Run Without History", items, "completed", now, now, null, null, null),
    run.bind("org-run", "user-a", "org-1", "t-private", "Org Run", items, "in_progress", now, now, "user-a", "user-b", "user-b"),
    event.bind("e-org", "user-a", "team", "org-1", "org-run", "checklist_run.created", JSON.stringify({ source: "web" }), now),
  ]);
}

const localD1 = runsOnLocalD1("run-provenance", seed);

async function listAs(userId: string, query = "") {
  const runs = await localD1.listAs(userId, query, listedRuns);
  return Object.fromEntries(Object.entries(runs).map(([id, run]) => [id, run.provenance]));
}

async function readAs(userId: string, runId: string) {
  const response = await localD1.requestAs(userId, `/${runId}`);
  expect(response.status).toBe(200);
  const text = await response.text();
  return { text, provenance: runWithProvenance.parse(JSON.parse(text)).provenance };
}

describe.sequential("run provenance against local D1, from the columns and the first audit event, with no migration", () => {
  it("records a run created in the web app as from the Web, and lists and reads it so", async () => {
    const created = await localD1.requestAs("user-a", "", {
      method: "POST",
      body: JSON.stringify({ title: "Browser Run", items }),
    });
    expect(created.status).toBe(200);
    const { id } = z.object({ id: z.string() }).parse(await created.json());

    expect(valueAt(await listAs("user-a"), id)).toEqual({ origin: "web", startedBy: alice });
    const { provenance } = await readAs("user-a", id);
    expect(provenance).toEqual({
      owner: { type: "personal", id: "user-a", name: alice.name },
      template: { id: null, title: null, requiredTools: [], version: 1 },
      origin: "web",
      agentKeyName: null,
      authorizedBy: null,
      createdBy: alice,
      startedBy: alice,
      assignedTo: null,
      completedBy: null,
    });
  });

  it("names an MCP run's Run Key and the person who authorized it, and never its key id, IP hash or user agent", async () => {
    expect(valueAt(await listAs("user-a"), "mcp-run")).toEqual({ origin: "mcp", startedBy: alice });

    const { provenance, text } = await readAs("user-a", "mcp-run");
    expect(provenance).toMatchObject({
      origin: "mcp",
      agentKeyName: "Codex SOP Runner",
      authorizedBy: alice,
      template: { id: "t-private", title: "Alice Private Playbook", version: 3 },
    });
    for (const secret of ["key-secret-id", "hash-of-an-ip", "Agent/1.0", "alice@example.test"]) expect(text).not.toContain(secret);
  });

  it("says Unknown for an older run whose creation names no source, and for a run with no history, rather than guessing", async () => {
    const runs = await listAs("user-a");
    expect(valueAt(runs, "legacy-run")).toEqual({ origin: "unknown", startedBy: alice });
    expect(valueAt(runs, "bare-run")).toEqual({ origin: "unknown", startedBy: null });
    expect((await readAs("user-a", "bare-run")).provenance).toMatchObject({ origin: "unknown", createdBy: null, startedBy: null });
  });

  it("names an Organization run's Organization, creator, starter and assignee, and hides a source Template the member cannot use", async () => {
    expect(valueAt(await listAs("user-b", "?teamId=org-1"), "org-run")).toEqual({ origin: "web", startedBy: bob });

    const { provenance } = await readAs("user-b", "org-run");
    expect(provenance).toMatchObject({
      owner: { type: "organization", id: "org-1", name: "Acme Org" },
      template: { id: "t-private", title: null, version: 3 },
      createdBy: alice,
      startedBy: bob,
      assignedTo: bob,
    });
  });

  it("reads the origin through the audit resource index and each actor by primary key", async () => {
    const details = await localD1.personalRunListPlan("user-a", { withProvenance: true });
    const auditSteps = details.filter((detail) => /\baudit_events\b/.test(detail));
    const userSteps = details.filter((detail) => /\busers\b/.test(detail));

    expect(auditSteps, JSON.stringify(details)).not.toHaveLength(0);
    for (const detail of auditSteps) expect(detail).toMatch(/^SEARCH audit_events USING INDEX idx_audit_events_resource/);
    expect(userSteps, JSON.stringify(details)).not.toHaveLength(0);
    for (const detail of userSteps) expect(detail).toMatch(/^SEARCH users USING .*\(id=\?\)/);
  });
});
