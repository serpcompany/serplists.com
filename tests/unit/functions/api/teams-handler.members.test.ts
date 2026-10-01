import { beforeEach, describe, expect, it } from "vitest";
import { auditMocks, dbMocks, mockEnv, resetTeamsHandlerMocks } from "../../../support/teamsHandler";
import { handleTeams } from "@functions/api/handlers/teams";
import { columnNamesIn } from "../../../support/drizzleSql";
import { apiErrorBody, jsonObjects, readJson } from "../../../support/readJson";

describe("Teams handler", () => {
  beforeEach(resetTeamsHandlerMocks);

  it("lists active team memberships", async () => {
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: "team-1",
        name: "Acme",
        slug: "acme",
        memberId: "member-1",
        role: "admin",
        membershipStatus: "active",
      },
    ]);

    const response = await handleTeams(new Request("http://localhost/api/teams"), mockEnv);
    const data = await readJson(response, jsonObjects);

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(expect.objectContaining({ id: "team-1", role: "admin" }));
  });

  it("lists the full team roster for team admins", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
    ]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: "member-disabled",
        team_id: "team-1",
        user_id: "user-disabled",
        role: "viewer",
        status: "disabled",
      },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/members"),
      mockEnv,
    );
    const data = await readJson(response, jsonObjects);
    const memberListPredicate = dbMocks.selectChain.where.mock.calls[1]?.[0];

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(expect.objectContaining({ id: "member-disabled" }));
    expect(columnNamesIn(memberListPredicate)).not.toContain("status");
  });

  it("limits the team roster to active members for non-admin members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "viewer", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/members"),
      mockEnv,
    );
    const memberListPredicate = dbMocks.selectChain.where.mock.calls[1]?.[0];

    expect(response.status).toBe(200);
    expect(columnNamesIn(memberListPredicate)).toContain("status");
  });

  it("transfers ownership to an active team member and records audit history", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "owner-member", team_id: "team-1", user_id: "owner-user", role: "owner", status: "active" },
      ])
      .mockResolvedValueOnce([
        { id: "member-2", team_id: "team-1", user_id: "user-2", role: "admin", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/owner", {
        method: "PUT",
        body: JSON.stringify({ memberId: "member-2" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, ownerMemberId: "member-2", ownerUserId: "user-2" });
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        role: expect.anything(),
        updated_at: expect.any(String),
      }),
    );
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        billing_owner_user_id: "user-2",
        updated_at: expect.any(String),
      }),
    );
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.owner_transferred",
        before: {
          ownerMemberId: "owner-member",
          ownerUserId: "owner-user",
        },
        after: {
          ownerMemberId: "member-2",
          ownerUserId: "user-2",
        },
      }),
    );
  });

  it("rejects ownership transfer attempts from non-owner admins", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "admin-member", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/owner", {
        method: "PUT",
        body: JSON.stringify({ memberId: "member-2" }),
      }),
      mockEnv,
    );
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(403);
    expect(data.code).toBe("owner_required");
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("rejects ownership transfer to the current owner member", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "owner-member", team_id: "team-1", user_id: "user-1", role: "owner", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/owner", {
        method: "PUT",
        body: JSON.stringify({ memberId: "owner-member" }),
      }),
      mockEnv,
    );
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.code).toBe("owner_transfer_noop");
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("rejects ownership transfer to inactive or missing members", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "owner-member", team_id: "team-1", user_id: "user-1", role: "owner", status: "active" },
      ])
      .mockResolvedValueOnce([]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/owner", {
        method: "PUT",
        body: JSON.stringify({ memberId: "member-disabled" }),
      }),
      mockEnv,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("returns a conflict when the ownership transfer write changes nothing", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "owner-member", team_id: "team-1", user_id: "owner-user", role: "owner", status: "active" },
      ])
      .mockResolvedValueOnce([
        { id: "member-2", team_id: "team-1", user_id: "user-2", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([]);
    dbMocks.db.batch.mockResolvedValueOnce([
      { meta: { changes: 0 } },
      { meta: { changes: 0 } },
      { meta: { changes: 0 } },
      { meta: { changes: 0 } },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/owner", {
        method: "PUT",
        body: JSON.stringify({ memberId: "member-2" }),
      }),
      mockEnv,
    );
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe("owner_transfer_conflict");
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.select).toHaveBeenCalled();
  });

  it("returns a conflict when a member update write changes nothing", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "admin-member", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        { id: "member-2", team_id: "team-1", user_id: "user-2", role: "editor", status: "active" },
      ]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/members/member-2", {
        method: "PUT",
        body: JSON.stringify({ role: "viewer" }),
      }),
      mockEnv,
    );
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe("member_update_conflict");
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.select).toHaveBeenCalled();
  });

  it("rejects self membership updates for team admins", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/members/member-1", {
        method: "PUT",
        body: JSON.stringify({ status: "disabled" }),
      }),
      mockEnv,
    );
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.code).toBe("self_membership_update_forbidden");
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("rejects owner membership updates through the member endpoint", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "admin-member", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        { id: "owner-member", team_id: "team-1", user_id: "owner-user", role: "owner", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/members/owner-member", {
        method: "PUT",
        body: JSON.stringify({ status: "disabled" }),
      }),
      mockEnv,
    );
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(400);
    expect(data.code).toBe("owner_membership_update_forbidden");
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });
});
