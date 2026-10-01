import { beforeEach, describe, expect, it } from "vitest";
import { auditMocks, dbMocks, mockEnv, resetTeamsHandlerMocks, teamMember } from "../../../support/teamsHandler";
import { handleTeams } from "@functions/api/handlers/teams";
import { columnNamesIn } from "../../../support/drizzleSql";
import { apiErrorBody, jsonObjects, readJson } from "../../../support/readJson";

const OWNER_USER = teamMember("owner", { id: "owner-member", user_id: "owner-user" });
const ADMIN_USER_2 = teamMember("admin", { id: "member-2", user_id: "user-2" });

const send = (path: string, method = "GET", body?: unknown) =>
  handleTeams(
    new Request(`http://localhost/api/teams/${path}`, body === undefined ? { method } : { method, body: JSON.stringify(body) }),
    mockEnv,
  );

const transferOwnershipTo = (memberId: string) => send("team-1/owner", "PUT", { memberId });

async function expectRefusedWithoutWriting(response: Response, status: number, code: string) {
  const data = await readJson(response, apiErrorBody);

  expect(response.status).toBe(status);
  expect(data.code).toBe(code);
  expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
}

async function expectAConflictWithNothingInserted(response: Response, code: string) {
  const data = await readJson(response, apiErrorBody);

  expect(response.status).toBe(409);
  expect(data.code).toBe(code);
  expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  expect(dbMocks.insertChain.select).toHaveBeenCalled();
}

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
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("admin")]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: "member-disabled",
        team_id: "team-1",
        user_id: "user-disabled",
        role: "viewer",
        status: "disabled",
      },
    ]);

    const response = await send("team-1/members");
    const data = await readJson(response, jsonObjects);
    const memberListPredicate = dbMocks.selectChain.where.mock.calls[1]?.[0];

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(expect.objectContaining({ id: "member-disabled" }));
    expect(columnNamesIn(memberListPredicate)).not.toContain("status");
  });

  it("limits the team roster to active members for non-admin members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("viewer")]);

    const response = await send("team-1/members");
    const memberListPredicate = dbMocks.selectChain.where.mock.calls[1]?.[0];

    expect(response.status).toBe(200);
    expect(columnNamesIn(memberListPredicate)).toContain("status");
  });

  it("transfers ownership to an active team member and records audit history", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([OWNER_USER]).mockResolvedValueOnce([ADMIN_USER_2]);

    const response = await transferOwnershipTo("member-2");
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
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("admin", { id: "admin-member" })]);

    await expectRefusedWithoutWriting(await transferOwnershipTo("member-2"), 403, "owner_required");
  });

  it("rejects ownership transfer to the current owner member", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("owner", { id: "owner-member" })]);

    await expectRefusedWithoutWriting(await transferOwnershipTo("owner-member"), 400, "owner_transfer_noop");
  });

  it("rejects ownership transfer to inactive or missing members", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("owner", { id: "owner-member" })])
      .mockResolvedValueOnce([]);

    const response = await transferOwnershipTo("member-disabled");

    expect(response.status).toBe(404);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("returns a conflict when the ownership transfer write changes nothing", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([OWNER_USER])
      .mockResolvedValueOnce([ADMIN_USER_2])
      .mockResolvedValueOnce([]);
    dbMocks.db.batch.mockResolvedValueOnce([
      { meta: { changes: 0 } },
      { meta: { changes: 0 } },
      { meta: { changes: 0 } },
      { meta: { changes: 0 } },
    ]);

    await expectAConflictWithNothingInserted(await transferOwnershipTo("member-2"), "owner_transfer_conflict");
  });

  it("returns a conflict when a member update write changes nothing", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin", { id: "admin-member" })])
      .mockResolvedValueOnce([teamMember("editor", { id: "member-2", user_id: "user-2" })]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    await expectAConflictWithNothingInserted(await send("team-1/members/member-2", "PUT", { role: "viewer" }), "member_update_conflict");
  });

  it("rejects self membership updates for team admins", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([teamMember("admin")]);

    await expectRefusedWithoutWriting(
      await send("team-1/members/member-1", "PUT", { status: "disabled" }),
      400,
      "self_membership_update_forbidden",
    );
  });

  it("rejects owner membership updates through the member endpoint", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin", { id: "admin-member" })])
      .mockResolvedValueOnce([OWNER_USER]);

    await expectRefusedWithoutWriting(
      await send("team-1/members/owner-member", "PUT", { status: "disabled" }),
      400,
      "owner_membership_update_forbidden",
    );
  });
});
