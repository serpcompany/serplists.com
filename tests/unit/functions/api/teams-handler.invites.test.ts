import { beforeEach, describe, expect, it } from "vitest";
import { firstOf } from "../../../support/elements";
import { z } from "zod";
import { auditMocks, dbMocks, inAMinute, mockEnv, resetTeamsHandlerMocks, teamMember } from "../../../support/teamsHandler";
import { handleTeams } from "@functions/api/handlers/teams";
import { apiErrorBody, readJson } from "../../../support/readJson";

const inviteBody = z.object({ inviteToken: z.string(), invitePath: z.string(), inviteUrl: z.string() }).passthrough();
const pendingInviteError = apiErrorBody.extend({ details: z.object({ inviteId: z.string() }).passthrough() });

function storedInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    team_id: "team-1",
    email: "new@example.com",
    role: "viewer",
    token_hash: "hashed-token",
    invited_by_user_id: "user-1",
    accepted_by_user_id: null,
    expires_at: inAMinute(),
    accepted_at: null,
    revoked_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    ...overrides,
  };
}

function anAdminAndTheInvite(invite: Record<string, unknown>) {
  return dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("admin")]).mockResolvedValueOnce([invite]);
}

const revokeTheInvite = () =>
  handleTeams(new Request("http://localhost/api/teams/team-1/invites/invite-1", { method: "DELETE" }), mockEnv);

const invite = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  handleTeams(
    new Request("http://localhost/api/teams/team-1/invites", { method: "POST", headers, body: JSON.stringify(body) }),
    mockEnv,
  );

const listInvites = (path: string) => handleTeams(new Request(`http://localhost/api/teams/${path}`), mockEnv);

function expectNothingRevoked(response: Response) {
  expect(response.status).toBe(404);
  expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
}

describe("Teams handler", () => {
  beforeEach(resetTeamsHandlerMocks);

  it("rejects invite creation for non-admin team members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("viewer")]);

    const response = await invite({ email: "new@example.com", role: "viewer" });

    expect(response.status).toBe(403);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it("creates hashed team invites for admins", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await invite({ email: "New@Example.com", role: "editor" }, { Origin: "https://app.serplists.test" });
    const data = await readJson(response, inviteBody);

    expect(response.status).toBe(200);
    expect(data.email).toBe("new@example.com");
    expect(data.role).toBe("editor");
    expect(typeof data.inviteToken).toBe("string");
    expect(data.invitePath).toBe(`/team-invites/${encodeURIComponent(data.inviteToken)}/`);
    expect(data.inviteUrl).toBe(`https://app.serplists.test/team-invites/${encodeURIComponent(data.inviteToken)}/`);
    expect(data.delivery).toEqual({
      mode: "link",
      status: "ready",
      invitePath: data.invitePath,
      inviteUrl: data.inviteUrl,
    });

    const insertedInvite = firstOf(dbMocks.insertChain.values.mock.calls)[0];
    expect(insertedInvite.token_hash).not.toBe(data.inviteToken);
    expect(insertedInvite.email).toBe("new@example.com");
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team_invite.created" }),
    );
  });

  it("lists pending invites for team admins", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("admin")]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: "invite-1",
        team_id: "team-1",
        email: "new@example.com",
        role: "editor",
        invited_by_user_id: "user-1",
        expires_at: inAMinute(),
        created_at: "2026-01-01T00:00:00.000Z",
        inviterEmail: "admin@example.com",
        inviterName: "Admin User",
      },
    ]);

    const response = await listInvites("team-1/invites");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      expect.objectContaining({
        id: "invite-1",
        email: "new@example.com",
        role: "editor",
        inviterEmail: "admin@example.com",
      }),
    ]);
  });

  it("lists incoming pending invites for the signed-in user's email", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ email: "new@example.com" }]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: "invite-1",
        teamId: "team-1",
        teamName: "Acme Team",
        teamSlug: "acme-team",
        email: "new@example.com",
        role: "viewer",
        expiresAt: inAMinute(),
        createdAt: "2026-01-01T00:00:00.000Z",
        inviterEmail: "owner@example.com",
        inviterName: "Owner User",
      },
    ]);

    const response = await listInvites("invites/pending");
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      expect.objectContaining({
        id: "invite-1",
        teamId: "team-1",
        teamName: "Acme Team",
        role: "viewer",
      }),
    ]);
  });

  it("rejects pending invite listing for non-admin team members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("runner")]);

    const response = await listInvites("team-1/invites");

    expect(response.status).toBe(403);
    expect(dbMocks.selectChain.orderBy).not.toHaveBeenCalled();
  });

  it("rejects invites for users who are already active members", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([{ id: "member-2" }]);

    const response = await invite({ email: "member@example.com", role: "viewer" });
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe("team_member_exists");
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it("rejects duplicate pending team invites", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "invite-existing", expires_at: inAMinute() }]);

    const response = await invite({ email: "New@Example.com", role: "editor" });
    const data = await readJson(response, pendingInviteError);

    expect(response.status).toBe(409);
    expect(data.code).toBe("team_invite_exists");
    expect(data.details.inviteId).toBe("invite-existing");
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it("revokes pending invites for team admins", async () => {
    const pending = storedInvite();
    anAdminAndTheInvite(pending);

    const response = await revokeTheInvite();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        revoked_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    );
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team_invite.revoked",
        before: pending,
      }),
    );
  });

  it("does not revoke invites that have already been accepted", async () => {
    anAdminAndTheInvite(storedInvite({ accepted_by_user_id: "user-2", accepted_at: "2026-01-01T00:00:00.000Z" }));

    expectNothingRevoked(await revokeTheInvite());
  });

  it("does not revoke expired invites", async () => {
    anAdminAndTheInvite(storedInvite({ expires_at: new Date(Date.now() - 60_000).toISOString() }));

    expectNothingRevoked(await revokeTheInvite());
  });

  it("reports a conflict instead of a revoke when the invite was accepted between read and write", async () => {
    anAdminAndTheInvite(storedInvite()).mockResolvedValueOnce([{ accepted_at: "2026-01-02T00:00:00.000Z" }]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const response = await revokeTheInvite();
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe("invite_already_accepted");
    expect(data.success).toBeUndefined();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.select).toHaveBeenCalled();
  });
});
