import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { callToolWithAFreshRunKey, openAFreshMcpDatabase } from "../../../support/agentMcpOnSqlite";
import { mcpRunResult, mcpTemplateResult, runKeyWithEveryPermission } from "../../../support/agentMcp";
import { apiEnv } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { sessionMocks } from "../../../support/mockedSession";
import { readJson } from "../../../support/readJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";

import { handleChecklists } from "@functions/api/handlers/checklists";
import { handleTeams } from "@functions/api/handlers/teams";
import { handleTemplates } from "@functions/api/handlers/templates";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/schemas/auditActions";

const NOW = "2026-09-28T00:00:00.000Z";
const OWNER = runKeyWithEveryPermission.userId;
const SECTIONS = [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task" }] }];
const SECTIONS_WITH_A_NEW_TASK = [{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task" }, { id: "i2", title: "New" }] }];

const withId = z.object({ id: z.string() }).passthrough();
const withVersion = z.object({ version: z.number() }).passthrough();
const withRevision = z.object({ revision: z.number() }).passthrough();
const createdShare = z.object({ shareToken: z.string() }).passthrough();
const createdInvite = z.object({ id: z.string(), inviteToken: z.string() }).passthrough();

type Handler = typeof handleTemplates;
type Drive = { route: string; writes: AuditAction; status: number; actionsWritten: string[] };

let d1: SqliteD1;
const drives: Drive[] = [];

const env = () => apiEnv({ DB: d1.binding, BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" });
const auditRowCount = () => d1.rows<{ value: number }>("SELECT count(*) AS value FROM audit_events")[0]?.value ?? 0;
const actionsSince = (count: number) =>
  d1.rows<{ action: string }>("SELECT action FROM audit_events ORDER BY rowid LIMIT -1 OFFSET ?", count).map(({ action }) => action);

async function drive(route: string, writes: AuditAction, send: () => Promise<Response>): Promise<Response> {
  const before = auditRowCount();
  const response = await send();
  drives.push({ route, writes, status: response.status, actionsWritten: actionsSince(before) });
  return response;
}

function as(userId: string, handler: Handler, path: string, method: string, body?: unknown) {
  sessionMocks.getSessionUserId.mockResolvedValue(userId);
  return handler(apiRequest(path, method, body), env());
}

async function mcpTool(name: string, args: Record<string, unknown>) {
  return (await callToolWithAFreshRunKey(d1, name, args)).result.structuredContent;
}

function seed() {
  const users = ["admin-user", "editor-user", "leaving-user", "accepting-user", "declining-user"];
  for (const id of [OWNER, ...users]) {
    d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES (?, ?, ?, 1, ?)", id, `${id}@example.test`, id, NOW);
  }
  d1.run("INSERT INTO entitlement_overrides (user_id, plan, note, created_at, updated_at) VALUES (?, 'pro', 'test', ?, ?)", OWNER, NOW, NOW);
  d1.run(
    "INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES ('team-1', 'Acme', 'acme', ?, ?, ?)",
    OWNER, OWNER, NOW,
  );
  const members = [[`${OWNER}-member`, OWNER, "owner"], ["admin-member", "admin-user", "admin"], ["editor-member", "editor-user", "editor"], ["leaving-member", "leaving-user", "viewer"]];
  for (const [id, userId, role] of members) {
    d1.run(
      `INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at, updated_at)
       VALUES (?, 'team-1', ?, ?, 'active', ?, ?, ?)`,
      id, userId, role, NOW, NOW, NOW,
    );
  }
}

async function driveTemplateRoutes() {
  const template = await readJson(await drive("POST /api/templates", "template.created", () =>
    as(OWNER, handleTemplates, "templates", "POST", { title: "Audited", sections: SECTIONS, is_public: true })), withId);
  const run = await readJson(await drive("POST /api/checklists", "checklist_run.created", () =>
    as(OWNER, handleChecklists, "checklists", "POST", { template_id: template.id, title: "Run" })), withId);
  const { version } = await readJson(await as(OWNER, handleTemplates, `templates/${template.id}`, "GET"), withVersion);
  await drive("PUT /api/templates/:id, which reconciles the Template's runs", "template.updated", () =>
    as(OWNER, handleTemplates, `templates/${template.id}`, "PUT", { expected_version: version, sections: SECTIONS_WITH_A_NEW_TASK }));
  await drive("POST /api/templates/:id/clone", "template.cloned", () => as(OWNER, handleTemplates, `templates/${template.id}/clone`, "POST"));
  await drive("POST /api/templates/backup", "template.imported", () =>
    as(OWNER, handleTemplates, "templates/backup", "POST", { templates: [{ title: "Imported", sections: SECTIONS }] }));
  const archivable = await readJson(await as(OWNER, handleTemplates, "templates", "POST", { title: "Archived", sections: SECTIONS }), withId);
  await drive("DELETE /api/templates/:id", "template.deleted", () => as(OWNER, handleTemplates, `templates/${archivable.id}`, "DELETE"));
  await drive("POST /api/templates/:id/restore", "template.restored", () => as(OWNER, handleTemplates, `templates/${archivable.id}/restore`, "POST"));
  const transferable = await readJson(await as(OWNER, handleTemplates, "templates", "POST", { title: "Transferred", sections: SECTIONS }), withId);
  const loaded = await readJson(await as(OWNER, handleTemplates, `templates/${transferable.id}`, "GET"), withVersion);
  await drive("POST /api/templates/:id/transfer", "template.transferred_to_organization", () =>
    as(OWNER, handleTemplates, `templates/${transferable.id}/transfer`, "POST", { teamId: "team-1", expected_version: loaded.version }));
  return { runId: run.id };
}

async function driveRunRoutes(runId: string) {
  const revision = async () => (await readJson(await as(OWNER, handleChecklists, `checklists/${runId}`, "GET"), withRevision)).revision;
  await drive("PUT /api/checklists/:id", "checklist_run.updated", async () =>
    as(OWNER, handleChecklists, `checklists/${runId}`, "PUT", { title: "Renamed", expected_revision: await revision() }));
  await drive("POST /api/checklists/:id/revalidate", "checklist_run.revalidated", async () =>
    as(OWNER, handleChecklists, `checklists/${runId}/revalidate`, "POST", { expected_revision: await revision() }));
  const share = await readJson(await drive("POST /api/checklists/run/:id/share", "checklist_run.share_created", () =>
    as(OWNER, handleChecklists, `checklists/run/${runId}/share`, "POST", {})), createdShare);
  await drive("PUT /api/checklists/shared/:token", "checklist_run.shared_updated", async () =>
    as("editor-user", handleChecklists, `checklists/shared/${share.shareToken}`, "PUT", { status: "in_progress", expected_revision: await revision() }));
  await drive("DELETE /api/checklists/run/:id/share", "checklist_run.share_revoked", () =>
    as(OWNER, handleChecklists, `checklists/run/${runId}/share`, "DELETE"));
  await drive("DELETE /api/checklists/:id", "checklist_run.deleted", () => as(OWNER, handleChecklists, `checklists/${runId}`, "DELETE"));
  await drive("POST /api/checklists/:id/restore", "checklist_run.restored", () => as(OWNER, handleChecklists, `checklists/${runId}/restore`, "POST"));
}

async function invite(email: string) {
  return readJson(await as(OWNER, handleTeams, "teams/team-1/invites", "POST", { email, role: "editor" }), createdInvite);
}

async function driveOrganizationRoutes() {
  await drive("POST /api/teams", "team.created", () => as(OWNER, handleTeams, "teams", "POST", { name: "Created" }));
  await drive("PUT /api/teams/:id", "team.updated", () => as(OWNER, handleTeams, "teams/team-1", "PUT", { name: "Renamed" }));
  const accepted = await readJson(await drive("POST /api/teams/:id/invites", "team_invite.created", () =>
    as(OWNER, handleTeams, "teams/team-1/invites", "POST", { email: "accepting-user@example.test", role: "editor" })), createdInvite);
  await drive("POST /api/teams/invites/:token/accept", "team_invite.accepted", () =>
    as("accepting-user", handleTeams, `teams/invites/${accepted.inviteToken}/accept`, "POST"));
  const declined = await invite("declining-user@example.test");
  await drive("POST /api/teams/invites/:token/decline", "team_invite.declined", () =>
    as("declining-user", handleTeams, `teams/invites/${declined.inviteToken}/decline`, "POST"));
  const revoked = await invite("someone@example.test");
  await drive("POST /api/teams/:id/invites/:inviteId/link", "team_invite.link_reissued", () =>
    as(OWNER, handleTeams, `teams/team-1/invites/${revoked.id}/link`, "POST"));
  await drive("DELETE /api/teams/:id/invites/:inviteId", "team_invite.revoked", () =>
    as(OWNER, handleTeams, `teams/team-1/invites/${revoked.id}`, "DELETE"));
  await drive("PUT /api/teams/:id/members/:memberId", "team_member.updated", () =>
    as(OWNER, handleTeams, "teams/team-1/members/editor-member", "PUT", { role: "viewer" }));
  await drive("POST /api/teams/:id/leave", "team_member.left", () => as("leaving-user", handleTeams, "teams/team-1/leave", "POST"));
  await drive("PUT /api/teams/:id/owner", "team.owner_transferred", () =>
    as(OWNER, handleTeams, "teams/team-1/owner", "PUT", { memberId: "admin-member" }));
}

async function driveMcpTools() {
  const created = mcpTemplateResult.parse(await driveTool("MCP create_template", "template.created", "create_template", { title: "From an agent", sections: SECTIONS }));
  await driveTool("MCP update_template", "template.updated", "update_template", {
    templateId: created.template.id,
    expectedVersion: created.template.version,
    title: "Renamed by an agent",
  });
  const started = mcpRunResult.parse(await driveTool("MCP start_run", "checklist_run.created", "start_run", { templateId: created.template.id }));
  await driveTool("MCP update_run", "checklist_run.updated", "update_run", {
    runId: started.run.id,
    expectedRevision: started.run.revision,
    operation: "set_run_status",
    status: "in_progress",
  });
}

async function driveTool(route: string, writes: AuditAction, name: string, args: Record<string, unknown>) {
  const before = auditRowCount();
  const content = await mcpTool(name, args);
  drives.push({ route, writes, status: 200, actionsWritten: actionsSince(before) });
  return content;
}

beforeAll(async () => {
  d1 = openAFreshMcpDatabase();
  seed();
  const { runId } = await driveTemplateRoutes();
  await driveRunRoutes(runId);
  await driveOrganizationRoutes();
  await driveMcpTools();
});

describe("the audit actions the API writes, driven route by route on the migrated tables", () => {
  it("drives every audited route to a success that records its action", () => {
    const missed = drives
      .filter(({ status, writes, actionsWritten }) => status !== 200 || !actionsWritten.includes(writes))
      .map(({ route, status, writes, actionsWritten }) => `${route} answered ${status}, wrote [${actionsWritten.join(", ")}], not ${writes}`);

    expect(drives.length).toBeGreaterThan(0);
    expect(missed).toEqual([]);
  });

  it("lists no action in AUDIT_ACTIONS that no route writes, so every history label belongs to a real change", () => {
    const written = new Set(drives.flatMap(({ actionsWritten }) => actionsWritten));

    expect(AUDIT_ACTIONS.filter((action) => !written.has(action))).toEqual([]);
  });

  it("writes no action that AUDIT_ACTIONS leaves out, which no history view could label", () => {
    const registered = new Set<string>(AUDIT_ACTIONS);
    const unregistered = drives.flatMap(({ route, actionsWritten }) =>
      actionsWritten.filter((action) => !registered.has(action)).map((action) => `${route}: ${action}`));

    expect(unregistered).toEqual([]);
  });
});
