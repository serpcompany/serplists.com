import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { apiErrorBody, readJson } from "../../../support/readJson";
import { auditMocks, dbMocks, inAMinute, mockEnv, resetTeamsHandlerMocks, teamMember } from "../../../support/teamsHandler";
import { handleTeams } from "@functions/api/handlers/teams";
import { anyInstanceOf, anything, objectContaining } from "../../../support/asymmetricMatchers";

const joinedTeamBody = z.object({ teamId: z.string(), memberId: z.string(), team: z.record(z.unknown()) }).passthrough();

const ACCEPT_BY_TOKEN = "http://localhost/api/teams/invites/invite-token/accept";
const ACCEPT_BY_ID = "http://localhost/api/teams/invites/pending/invite-1/accept";

const ADMIN_INVITER = teamMember("admin", { id: "inviter-member", user_id: "admin-1" });

function invite(role: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    team_id: "team-1",
    email: "new@example.com",
    role,
    invited_by_user_id: "admin-1",
    expires_at: inAMinute(),
    accepted_at: null,
    revoked_at: null,
    ...overrides,
  };
}

function theInviteItsTeamAndTheEmailSignedIn(pending: Record<string, unknown>, email = "new@example.com") {
  return dbMocks.selectChain.limit
    .mockResolvedValueOnce([pending])
    .mockResolvedValueOnce([{ id: "team-1", name: "Acme Team", slug: "acme-team" }])
    .mockResolvedValueOnce([{ email }]);
}

function anAcceptanceThatCreates(role: string) {
  theInviteItsTeamAndTheEmailSignedIn(invite(role))
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([ADMIN_INVITER])
    .mockResolvedValueOnce([{ id: "invite-1" }])
    .mockResolvedValueOnce([teamMember(role, { id: "member-created" })]);
}

const accept = (url: string) => handleTeams(new Request(url, { method: "POST" }), mockEnv);

describe("Teams handler", () => {
  beforeEach(resetTeamsHandlerMocks);

  it("accepts an invite for the matching user email", async () => {
    anAcceptanceThatCreates("editor");

    const response = await accept(ACCEPT_BY_TOKEN);
    const data = await readJson(response, joinedTeamBody);

    expect(response.status).toBe(200);
    expect(data.teamId).toBe("team-1");
    expect(data.memberId).toBe("member-created");
    expect(data.role).toBe("editor");
    expect(data.team).toEqual(
      objectContaining({
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
      objectContaining({
        target: anyInstanceOf(Array),
      }),
    );
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      objectContaining({
        accepted_by_user_id: "user-1",
        accepted_at: anyInstanceOf(String),
      }),
    );
  });

  it("accepts an incoming invite by id for the signed-in user", async () => {
    anAcceptanceThatCreates("viewer");

    const response = await accept(ACCEPT_BY_ID);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      objectContaining({
        memberId: "member-created",
        role: "viewer",
        teamId: "team-1",
        team: objectContaining({
          name: "Acme Team",
          role: "viewer",
        }),
      }),
    );
  });

  it.each([
    ["an invite link", ACCEPT_BY_TOKEN],
    ["an incoming invite", ACCEPT_BY_ID],
  ])("tells a different account that %s is for another email, without naming it", async (_label, url) => {
    theInviteItsTeamAndTheEmailSignedIn(invite("editor", { email: "work@acme.example" }), "personal@example.com");

    const response = await accept(url);
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(JSON.parse(body)).toEqual(
      objectContaining({
        error: "Invite is for a different email address",
        code: "invite_email_mismatch",
      }),
    );
    expect(body).not.toContain("work@acme.example");
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it("returns a conflict when invite acceptance is lost during the write", async () => {
    theInviteItsTeamAndTheEmailSignedIn(invite("editor"))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ADMIN_INVITER])
      .mockResolvedValueOnce([]);

    const response = await accept(ACCEPT_BY_TOKEN);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe("invite_acceptance_conflict");
    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(dbMocks.insertChain.select).toHaveBeenCalled();
    expect(dbMocks.insertChain.onConflictDoNothing).toHaveBeenCalled();
  });

  it("refuses an invite for an already active member without changing their role", async () => {
    theInviteItsTeamAndTheEmailSignedIn(invite("viewer"))
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([ADMIN_INVITER]);

    const response = await accept(ACCEPT_BY_TOKEN);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual(objectContaining({
      code: "team_member_exists",
      details: { teamId: "team-1", role: "admin" },
    }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalledWith(objectContaining({ role: anything() }));
    expect(dbMocks.updateChain.set).not.toHaveBeenCalledWith(objectContaining({ accepted_at: anyInstanceOf(String) }));
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith({ revoked_at: anyInstanceOf(String), updated_at: anyInstanceOf(String) });
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(objectContaining({
      action: "team_invite.revoked",
      metadata: { reason: "invitee_already_member" },
    }));
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalledWith(objectContaining({
      action: "team_invite.accepted",
    }));
  });

  it.each([
    ["no longer an active member", []],
    ["below admin", [teamMember("editor", { id: "inviter-member", user_id: "admin-1" })]],
  ])("refuses an invite whose inviter is %s", async (_label, inviterRows) => {
    theInviteItsTeamAndTheEmailSignedIn(invite("admin"))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(inviterRows);

    const response = await accept(ACCEPT_BY_ID);

    expect(response.status).toBe(404);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("returns success when the same user retries an accepted invite", async () => {
    theInviteItsTeamAndTheEmailSignedIn(invite("editor", { accepted_by_user_id: "user-1", accepted_at: new Date().toISOString() }))
      .mockResolvedValueOnce([teamMember("editor")]);

    const response = await accept(ACCEPT_BY_TOKEN);
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
