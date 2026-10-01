import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { auditMocks, dbMocks, mockEnv, resetTeamsHandlerMocks } from "../../../support/teamsHandler";
import { handleTeams } from "@functions/api/handlers/teams";
import { apiErrorBody, readJson } from "../../../support/readJson";

const joinedTeamBody = z.object({ teamId: z.string(), memberId: z.string(), team: z.record(z.unknown()) }).passthrough();

describe("Teams handler", () => {
  beforeEach(resetTeamsHandlerMocks);

  it("accepts an invite for the matching user email", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "new@example.com",
          role: "editor",
          invited_by_user_id: "admin-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          accepted_at: null,
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "team-1", name: "Acme Team", slug: "acme-team" }])
      .mockResolvedValueOnce([{ email: "new@example.com" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "inviter-member", team_id: "team-1", user_id: "admin-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([{ id: "invite-1" }])
      .mockResolvedValueOnce([
        { id: "member-created", team_id: "team-1", user_id: "user-1", role: "editor", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/invite-token/accept", { method: "POST" }),
      mockEnv,
    );
    const data = await readJson(response, joinedTeamBody);

    expect(response.status).toBe(200);
    expect(data.teamId).toBe("team-1");
    expect(data.memberId).toBe("member-created");
    expect(data.role).toBe("editor");
    expect(data.team).toEqual(
      expect.objectContaining({
        id: "team-1",
        memberId: "member-created",
        membershipStatus: "active",
        name: "Acme Team",
        role: "editor",
        slug: "acme-team",
      }),
    );

    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.select).toHaveBeenCalled();
    expect(dbMocks.insertChain.onConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
      }),
    );
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        accepted_by_user_id: "user-1",
        accepted_at: expect.any(String),
      }),
    );
  });

  it("accepts an incoming invite by id for the signed-in user", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "new@example.com",
          role: "viewer",
          invited_by_user_id: "admin-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          accepted_at: null,
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "team-1", name: "Acme Team", slug: "acme-team" }])
      .mockResolvedValueOnce([{ email: "new@example.com" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "inviter-member", team_id: "team-1", user_id: "admin-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([{ id: "invite-1" }])
      .mockResolvedValueOnce([
        { id: "member-created", team_id: "team-1", user_id: "user-1", role: "viewer", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/pending/invite-1/accept", {
        method: "POST",
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        memberId: "member-created",
        role: "viewer",
        teamId: "team-1",
        team: expect.objectContaining({
          name: "Acme Team",
          role: "viewer",
        }),
      }),
    );
  });

  it.each([
    ["an invite link", "http://localhost/api/teams/invites/invite-token/accept"],
    ["an incoming invite", "http://localhost/api/teams/invites/pending/invite-1/accept"],
  ])("tells a different account that %s is for another email, without naming it", async (_label, url) => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "work@acme.example",
          role: "editor",
          invited_by_user_id: "admin-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          accepted_at: null,
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "team-1", name: "Acme Team", slug: "acme-team" }])
      .mockResolvedValueOnce([{ email: "personal@example.com" }]);

    const response = await handleTeams(new Request(url, { method: "POST" }), mockEnv);
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(JSON.parse(body)).toEqual(
      expect.objectContaining({
        error: "Invite is for a different email address",
        code: "invite_email_mismatch",
      }),
    );
    expect(body).not.toContain("work@acme.example");
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it("returns a conflict when invite acceptance is lost during the write", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "new@example.com",
          role: "editor",
          invited_by_user_id: "admin-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          accepted_at: null,
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "team-1", name: "Acme Team", slug: "acme-team" }])
      .mockResolvedValueOnce([{ email: "new@example.com" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "inviter-member", team_id: "team-1", user_id: "admin-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/invite-token/accept", { method: "POST" }),
      mockEnv,
    );
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe("invite_acceptance_conflict");
    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(dbMocks.insertChain.select).toHaveBeenCalled();
    expect(dbMocks.insertChain.onConflictDoNothing).toHaveBeenCalled();
  });

  it("refuses an invite for an already active member without changing their role", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "new@example.com",
          role: "viewer",
          invited_by_user_id: "admin-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          accepted_at: null,
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "team-1", name: "Acme Team", slug: "acme-team" }])
      .mockResolvedValueOnce([{ email: "new@example.com" }])
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        { id: "inviter-member", team_id: "team-1", user_id: "admin-1", role: "admin", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/invite-token/accept", { method: "POST" }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual(expect.objectContaining({
      code: "team_member_exists",
      details: { teamId: "team-1", role: "admin" },
    }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalledWith(expect.objectContaining({ role: expect.anything() }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalledWith(expect.objectContaining({ accepted_at: expect.any(String) }));
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ revoked_at: expect.any(String), updated_at: expect.any(String) });
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(expect.objectContaining({
      action: "team_invite.revoked",
      metadata: { reason: "invitee_already_member" },
    }));
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalledWith(expect.objectContaining({
      action: "team_invite.accepted",
    }));
  });

  it.each([
    ["no longer an active member", []],
    ["below admin", [{ id: "inviter-member", team_id: "team-1", user_id: "admin-1", role: "editor", status: "active" }]],
  ])("refuses an invite whose inviter is %s", async (_label, inviterRows) => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "new@example.com",
          role: "admin",
          invited_by_user_id: "admin-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          accepted_at: null,
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "team-1", name: "Acme Team", slug: "acme-team" }])
      .mockResolvedValueOnce([{ email: "new@example.com" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(inviterRows);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/pending/invite-1/accept", { method: "POST" }),
      mockEnv,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("returns success when the same user retries an accepted invite", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "new@example.com",
          role: "editor",
          invited_by_user_id: "admin-1",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          accepted_by_user_id: "user-1",
          accepted_at: new Date().toISOString(),
          revoked_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "team-1", name: "Acme Team", slug: "acme-team" }])
      .mockResolvedValueOnce([{ email: "new@example.com" }])
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "editor", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/invite-token/accept", { method: "POST" }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      teamId: "team-1",
      memberId: "member-1",
      role: "editor",
      team: {
        id: "team-1",
        memberId: "member-1",
        membershipStatus: "active",
        name: "Acme Team",
        role: "editor",
        slug: "acme-team",
      },
    });
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });
});
