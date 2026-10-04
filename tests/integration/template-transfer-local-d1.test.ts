import { runsOnLocalD1 } from "./local-d1-runs";
import { handleTemplates } from "../../functions/api/handlers/templates";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const now = "2026-10-04T00:00:00.000Z";
const items = JSON.stringify([{ id: "s1", title: "Section", items: [{ id: "i1", title: "Step" }] }]);

async function seed(db: D1Database) {
  const user = db.prepare("INSERT INTO users (id, email, name, username, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)");
  const team = db.prepare("INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES (?, ?, ?, 'user-a', 'user-a', ?)");
  const member = db.prepare("INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)");
  const template = db.prepare(`
    INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id, created_by_user_id, content_version, slug)
    VALUES (?, ?, ?, ?, ?, ?, 3, 'checklist', ?, ?, ?, 2, ?)
  `);
  await db.batch([
    user.bind("user-a", "a@example.test", "Alice", "alice", now),
    user.bind("user-b", "b@example.test", "Bob", "bob", now),
    team.bind("org-paid", "Paid Org", "paid-org", now),
    team.bind("org-free", "Free Org", "free-org", now),
    team.bind("org-runner", "Runner Org", "runner-org", now),
    team.bind("org-other", "Other Org", "other-org", now),
    db.prepare("INSERT INTO team_entitlement_overrides (team_id, plan, note, created_at) VALUES ('org-paid', 'team', 'test', ?)").bind(now),
    member.bind("m-1", "org-paid", "user-a", "editor", now),
    member.bind("m-2", "org-free", "user-a", "owner", now),
    member.bind("m-3", "org-runner", "user-a", "runner", now),
    member.bind("m-4", "org-paid", "user-b", "viewer", now),
    template.bind("t-private", "user-a", "Launch Playbook", items, 0, now, "user", null, "user-a", "launch-playbook"),
    template.bind("t-limit", "user-a", "Limit Playbook", items, 0, now, "user", null, "user-a", "limit-playbook"),
    template.bind("t-public", "user-a", "Public Playbook", items, 1, now, "user", null, "user-a", "public-playbook"),
    template.bind("t-bob", "user-b", "Bob Playbook", items, 0, now, "user", null, "user-b", "bob-playbook"),
    template.bind("t-org", "user-a", "Org Playbook", items, 0, now, "team", "org-paid", "user-a", "org-playbook"),
    template.bind("t-free-full", "user-a", "Free Org Playbook", items, 0, now, "team", "org-free", "user-a", "free-org-playbook"),
    db.prepare(`
      INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, created_at, progress,
        created_by_user_id, started_by_user_id, template_version, revision, retired_items, is_public)
      VALUES ('run-personal', 'user-a', NULL, 't-private', 'Personal Run', ?, 'in_progress', ?, ?, 0, 'user-a', 'user-a', 2, 1, '[]', 0)
    `).bind(items, now, now),
  ]);
}

const localD1 = runsOnLocalD1("template-transfer", seed);

const templatesAs = (userId: string, path: string, init?: RequestInit) => localD1.requestWith(handleTemplates, userId, `/api/templates${path}`, init);
const transfer = (userId: string, templateId: string, body: unknown) =>
  templatesAs(userId, `/${templateId}/transfer`, { method: "POST", body: JSON.stringify(body) });

const errorBody = z.object({ code: z.string().optional() }).passthrough();
const templateRow = (id: string) =>
  localD1.db().prepare("SELECT owner_type, team_id, user_id, created_by_user_id, version, content_version, is_public FROM templates WHERE id = ?").bind(id).first();
const countWhere = async (sqlText: string, ...args: string[]) =>
  z.object({ n: z.number() }).parse(await localD1.db().prepare(sqlText).bind(...args).first()).n;
const writesFor = async (templateId: string) => ({
  events: await countWhere("SELECT count(*) AS n FROM audit_events WHERE resource_id = ? AND action = 'template.transferred_to_organization'", templateId),
  versions: await countWhere("SELECT count(*) AS n FROM template_versions WHERE template_id = ? AND change_summary = 'template.transferred_to_organization'", templateId),
});

describe.sequential("transferring a Personal Template to an Organization, against local D1", () => {
  it("refuses a stale version, changing nothing, so a transfer never overwrites an edit made meanwhile", async () => {
    const response = await transfer("user-a", "t-private", { teamId: "org-paid", expected_version: 2 });

    expect(response.status).toBe(409);
    expect(errorBody.parse(await response.json()).code).toBe("edit_conflict");
    expect(await templateRow("t-private")).toMatchObject({ owner_type: "user", team_id: null, version: 3 });
    expect(await writesFor("t-private")).toEqual({ events: 0, versions: 0 });
  });

  it("moves the Template in place to the Organization, keeping its id, creator and content version, with one audit event and version", async () => {
    const response = await transfer("user-a", "t-private", { teamId: "org-paid", expected_version: 3 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, id: "t-private", teamId: "org-paid", version: 4 });
    expect(await templateRow("t-private")).toEqual({
      owner_type: "team",
      team_id: "org-paid",
      user_id: "user-a",
      created_by_user_id: "user-a",
      version: 4,
      content_version: 2,
      is_public: 0,
    });
    expect(await writesFor("t-private")).toEqual({ events: 1, versions: 1 });
    const event = await localD1.db().prepare("SELECT subject_type, subject_id FROM audit_events WHERE resource_id = 't-private' AND action = 'template.transferred_to_organization'").first();
    expect(event).toEqual({ subject_type: "team", subject_id: "org-paid" });
  });

  it("leaves the Template's existing Personal runs where they were", async () => {
    const run = await localD1.db().prepare("SELECT user_id, team_id, template_id FROM checklist_runs WHERE id = 'run-personal'").first();

    expect(run).toEqual({ user_id: "user-a", team_id: null, template_id: "t-private" });
  });

  it("lists the transferred Template in the Organization for its members, and no longer in Personal", async () => {
    const inOrganization = await templatesAs("user-b", "?teamId=org-paid");
    const inPersonal = await templatesAs("user-a", "?scope=personal");

    expect(await inOrganization.text()).toContain("t-private");
    expect(await inPersonal.text()).not.toContain("t-private");
  });

  it("refuses a public Template until it is made private, an Organization's Template, and someone else's", async () => {
    const publicOne = await transfer("user-a", "t-public", { teamId: "org-paid", expected_version: 3 });
    const organizationOne = await transfer("user-a", "t-org", { teamId: "org-paid", expected_version: 3 });
    const someoneElses = await transfer("user-a", "t-bob", { teamId: "org-paid", expected_version: 3 });

    expect([publicOne.status, organizationOne.status, someoneElses.status]).toEqual([409, 403, 404]);
    expect(errorBody.parse(await publicOne.json()).code).toBe("template_public");
    expect(errorBody.parse(await organizationOne.json()).code).toBe("not_transferable");
  });

  it("refuses an Organization where the user cannot add Templates, or is not a member", async () => {
    const asRunner = await transfer("user-a", "t-limit", { teamId: "org-runner", expected_version: 3 });
    const notMember = await transfer("user-a", "t-limit", { teamId: "org-other", expected_version: 3 });

    expect([asRunner.status, notMember.status]).toEqual([403, 404]);
    expect(await templateRow("t-limit")).toMatchObject({ owner_type: "user", team_id: null });
  });

  it("refuses an Organization at its Template limit, changing nothing", async () => {
    const response = await transfer("user-a", "t-limit", { teamId: "org-free", expected_version: 3 });

    expect(response.status).toBe(403);
    expect(errorBody.parse(await response.json()).code).toBe("limit_reached");
    expect(await templateRow("t-limit")).toMatchObject({ owner_type: "user", team_id: null, version: 3 });
    expect(await writesFor("t-limit")).toEqual({ events: 0, versions: 0 });
  });

  it("asks for the Organization when none is given", async () => {
    const response = await transfer("user-a", "t-limit", { expected_version: 3 });

    expect(response.status).toBe(400);
    expect(errorBody.parse(await response.json()).code).toBe("invalid_transfer");
  });
});
