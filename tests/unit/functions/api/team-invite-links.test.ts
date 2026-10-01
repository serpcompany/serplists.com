import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chainSelectsUpdatesAndDeletes } from "../../../support/drizzleChainMocks";

const dbMocks = await vi.hoisted(async () => (await import("../../../support/drizzleChainMocks")).drizzleChainMocks());

const sessionMocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  buildAuditEventValues: vi.fn(async (input: { action: string; before?: unknown; after?: unknown }) => ({
    id: "audit-event",
    actor_user_id: "user-1",
    subject_type: "team",
    subject_id: "team-1",
    resource_type: "team_invite",
    resource_id: "invite-1",
    action: input.action,
    before_json: JSON.stringify(input.before ?? null),
    after_json: JSON.stringify(input.after ?? null),
    diff_json: null,
    metadata_json: null,
    request_id: null,
    ip_hash: null,
    user_agent: null,
    created_at: "2026-01-01T00:00:00.000Z",
  })),
}));

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock("@functions/api/utils/session", () => ({
  getSessionUserId: sessionMocks.getSessionUserId,
}));

vi.mock("@functions/api/utils/audit", () => ({
  buildAuditEventValues: auditMocks.buildAuditEventValues,
}));

import { handleTeams } from "@functions/api/handlers/teams";
import { apiEnv } from "../../../support/apiEnv";
import { columnNamesIn } from "../../../support/drizzleSql";
import { jsonObject, readJson } from "../../../support/readJson";
import { sha256Hex } from "@functions/api/utils/crypto";

const mockEnv = apiEnv({ BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" });

const inviteLinkBody = z.object({ inviteToken: z.string(), invitePath: z.string(), inviteUrl: z.string() }).passthrough();
const inviteBody = z.object({ role: z.string() }).passthrough();

const inFuture = () => new Date(Date.now() + 60_000).toISOString();

function membership(role: string) {
  return { id: "member-1", team_id: "team-1", user_id: "user-1", role, status: "active" };
}

function pendingInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    email: "newhire@example.com",
    role: "viewer",
    expires_at: inFuture(),
    ...overrides,
  };
}

function newLinkRequest(body?: unknown, inviteId = "invite-1") {
  return new Request(`http://localhost/api/teams/team-1/invites/${inviteId}/link`, {
    method: "POST",
    headers: { Origin: "https://app.serplists.test" },
    body: typeof body === "undefined" ? undefined : JSON.stringify(body),
  });
}

async function replaceTheLinkAsAnAdmin() {
  dbMocks.selectChain.limit
    .mockResolvedValueOnce([membership("admin")])
    .mockResolvedValueOnce([pendingInvite()]);
  const response = await handleTeams(newLinkRequest(), mockEnv);
  return { response, data: await readJson(response, inviteLinkBody), storedChanges: () => dbMocks.updateChain.set.mock.calls[0][0] };
}

describe("POST /api/teams/:teamId/invites/:inviteId/link, which replaces a lost link since only its token hash is kept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.limit.mockReset();
    dbMocks.db.batch.mockReset();
    chainSelectsUpdatesAndDeletes(dbMocks);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue(dbMocks.insertChain);
    dbMocks.insertChain.select.mockReturnValue(dbMocks.insertChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
  });

  it("replaces the pending invite's token and returns a new link", async () => {
    const { response, data } = await replaceTheLinkAsAnAdmin();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        id: "invite-1",
        email: "newhire@example.com",
        role: "viewer",
        expiresAt: expect.any(String),
      }),
    );
    expect(typeof data.inviteToken).toBe("string");
    expect(data.invitePath).toBe(`/team-invites/${encodeURIComponent(data.inviteToken)}/`);
    expect(data.inviteUrl).toBe(`https://app.serplists.test${data.invitePath}`);
    expect(data.delivery).toEqual({
      mode: "link",
      status: "ready",
      invitePath: data.invitePath,
      inviteUrl: data.inviteUrl,
    });
  });

  it("stores only the new token's hash, so the old link stops working", async () => {
    const { data, storedChanges } = await replaceTheLinkAsAnAdmin();

    const updates = storedChanges();
    expect(updates.token_hash).toBe(await sha256Hex(data.inviteToken));
    expect(updates.token_hash).not.toBe(data.inviteToken);
    expect(Date.parse(updates.expires_at)).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    expect(updates.role).toBe("viewer");
  });

  it("repeats the pending checks in the write, scoped to this Organization", async () => {
    await replaceTheLinkAsAnAdmin();

    const whereColumns = columnNamesIn(dbMocks.updateChain.where.mock.calls[0][0]);
    expect(whereColumns).toEqual(
      expect.arrayContaining(["id", "team_id", "accepted_at", "revoked_at", "expires_at"]),
    );
  });

  it("writes the audit row only when the token was replaced, and never with the token", async () => {
    const { data, storedChanges } = await replaceTheLinkAsAnAdmin();

    const updates = storedChanges();
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
    expect(dbMocks.insertChain.select).toHaveBeenCalledTimes(1);
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledTimes(1);
    const auditInput = auditMocks.buildAuditEventValues.mock.calls[0][0];
    expect(auditInput.action).toBe("team_invite.link_reissued");
    const auditText = JSON.stringify(auditInput);
    expect(auditText).not.toContain(data.inviteToken);
    expect(auditText).not.toContain(updates.token_hash);
    expect(auditText).not.toContain("token_hash");
  });

  it("applies a new role chosen when the link is replaced", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([membership("owner")])
      .mockResolvedValueOnce([pendingInvite()]);

    const response = await handleTeams(newLinkRequest({ role: "editor" }), mockEnv);
    const data = await readJson(response, inviteBody);

    expect(response.status).toBe(200);
    expect(data.role).toBe("editor");
    expect(dbMocks.updateChain.set.mock.calls[0][0].role).toBe("editor");
    expect(auditMocks.buildAuditEventValues.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        before: expect.objectContaining({ role: "viewer" }),
        after: expect.objectContaining({ role: "editor" }),
      }),
    );
  });

  it("never makes a replaced link an owner invite", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([membership("owner")])
      .mockResolvedValueOnce([pendingInvite()]);

    const response = await handleTeams(newLinkRequest({ role: "owner" }), mockEnv);

    expect(response.status).toBe(400);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it.each(["editor", "runner", "viewer"])("forbids %s members", async (role) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([membership(role)]);

    const response = await handleTeams(newLinkRequest(), mockEnv);

    expect(response.status).toBe(403);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it("returns 404 for a revoked, accepted, expired or other Organization's invite, which the scoped lookup cannot find", async () => {
    const pendingInvitesTheScopedLookupFinds: never[] = [];
    dbMocks.selectChain.limit.mockResolvedValueOnce([membership("admin")]).mockResolvedValueOnce(pendingInvitesTheScopedLookupFinds);

    const response = await handleTeams(newLinkRequest(undefined, "invite-other-team"), mockEnv);

    expect(response.status).toBe(404);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    const whereColumns = columnNamesIn(dbMocks.selectChain.where.mock.calls[1][0]);
    expect(whereColumns).toEqual(
      expect.arrayContaining(["id", "team_id", "accepted_at", "revoked_at", "expires_at"]),
    );
  });

  it("returns 404 without a link when the invite is accepted or revoked during the write", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([membership("admin")])
      .mockResolvedValueOnce([pendingInvite()]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const response = await handleTeams(newLinkRequest(), mockEnv);
    const data = await readJson(response, jsonObject);

    expect(response.status).toBe(404);
    expect(data.inviteToken).toBeUndefined();
    expect(data.inviteUrl).toBeUndefined();
  });

  it("does not create a second invite when posting to an invite's subpath", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([membership("admin")]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites/invite-1/unknown", {
        method: "POST",
        body: JSON.stringify({ email: "newhire@example.com", role: "viewer" }),
      }),
      mockEnv,
    );

    expect(response.status).toBe(405);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });
});
