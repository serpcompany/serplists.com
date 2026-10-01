import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => {
  const selectChain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
  const insertChain = {
    values: vi.fn(),
    select: vi.fn(),
    onConflictDoNothing: vi.fn(),
  };
  const updateChain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  const deleteChain = {
    where: vi.fn(),
  };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    delete: vi.fn(() => deleteChain),
    batch: vi.fn(),
  };

  return { selectChain, insertChain, updateChain, deleteChain, db };
});

const sessionMocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  buildAuditEventValues: vi.fn(async (input: { action: string }) => ({
    id: "audit-event",
    action: input.action,
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

const mockEnv = {
  DB: {} as D1Database,
  BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
};

const inFuture = () => new Date(Date.now() + 60_000).toISOString();
const inPast = () => new Date(Date.now() - 60_000).toISOString();

function previewRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    team_id: "team-1",
    email: "invitee@example.com",
    role: "editor",
    expires_at: inFuture(),
    accepted_at: null,
    accepted_by_user_id: null,
    revoked_at: null,
    teamId: "team-1",
    teamName: "Acme Corp",
    teamSlug: "acme-corp",
    teamArchivedAt: null,
    inviterName: "Owner User",
    inviterEmail: "owner@example.com",
    inviterCanManage: 1,
    ...overrides,
  };
}

function inviteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "invite-1",
    team_id: "team-1",
    email: "invitee@example.com",
    role: "editor",
    token_hash: "hash",
    invited_by_user_id: "owner-1",
    accepted_by_user_id: null,
    expires_at: inFuture(),
    accepted_at: null,
    revoked_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    ...overrides,
  };
}

function expectNoWrites() {
  expect(dbMocks.db.update).not.toHaveBeenCalled();
  expect(dbMocks.db.insert).not.toHaveBeenCalled();
  expect(dbMocks.db.delete).not.toHaveBeenCalled();
  expect(dbMocks.db.batch).not.toHaveBeenCalled();
}

function conditionalAuditQuery() {
  expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  expect(dbMocks.insertChain.select).toHaveBeenCalledTimes(1);
  return new SQLiteAsyncDialect().sqlToQuery(dbMocks.insertChain.select.mock.calls[0][0] as SQL);
}

const previewRequest = (token = "invite-token") =>
  new Request(`http://localhost/api/teams/invites/${token}`);

describe("Organization invite preview, which writes nothing so opening a link joins no one", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue(dbMocks.insertChain);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.deleteChain.where.mockReturnValue(dbMocks.deleteChain);
    dbMocks.db.batch.mockResolvedValue([]);
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
  });

  it("describes a pending invite without accepting it", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([previewRow()])
      .mockResolvedValueOnce([{ email: "Invitee@Example.com" }]);

    const response = await handleTeams(previewRequest(), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(data).toEqual({
      status: "pending",
      teamId: "team-1",
      teamName: "Acme Corp",
      teamSlug: "acme-corp",
      role: "editor",
      expiresAt: expect.any(String),
      inviterName: "Owner User",
      inviterEmail: "owner@example.com",
    });
    expectNoWrites();
  });

  it("refuses a different account without revealing the Organization", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([previewRow()])
      .mockResolvedValueOnce([{ email: "someone-else@example.com" }]);

    const response = await handleTeams(previewRequest(), mockEnv);
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(JSON.parse(body).code).toBe("invite_email_mismatch");
    expect(body).not.toContain("Acme Corp");
    expect(body).not.toContain("owner@example.com");
    expectNoWrites();
  });

  it("reports an expired invite", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([previewRow({ expires_at: inPast() })])
      .mockResolvedValueOnce([{ email: "invitee@example.com" }]);

    const response = await handleTeams(previewRequest(), mockEnv);

    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe("invite_expired");
    expectNoWrites();
  });

  it.each([
    ["unknown", []],
    ["revoked", [previewRow({ revoked_at: "2026-01-02T00:00:00.000Z" })]],
    ["archived", [previewRow({ teamArchivedAt: "2026-01-02T00:00:00.000Z" })]],
    ["orphaned", [previewRow({ teamId: null, teamName: null })]],
  ])("returns 404 for an %s invite", async (_label, rows) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce(rows);

    const response = await handleTeams(previewRequest(), mockEnv);

    expect(response.status).toBe(404);
    expectNoWrites();
  });

  it("returns 404 for a pending invite whose inviter no longer manages the Organization", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([previewRow({ inviterCanManage: 0 })])
      .mockResolvedValueOnce([{ email: "invitee@example.com" }]);

    const response = await handleTeams(previewRequest(), mockEnv);

    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expectNoWrites();
  });

  it("returns 404 for an invite another account already accepted", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        previewRow({ accepted_at: "2026-01-02T00:00:00.000Z", accepted_by_user_id: "user-2" }),
      ])
      .mockResolvedValueOnce([{ email: "invitee@example.com" }]);

    const response = await handleTeams(previewRequest(), mockEnv);

    expect(response.status).toBe(404);
    expectNoWrites();
  });

  it("tells an existing member they already belong to the Organization", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        previewRow({ accepted_at: "2026-01-02T00:00:00.000Z", accepted_by_user_id: "user-1" }),
      ])
      .mockResolvedValueOnce([{ email: "invitee@example.com" }])
      .mockResolvedValueOnce([{ id: "member-1", role: "viewer" }]);

    const response = await handleTeams(previewRequest(), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(expect.objectContaining({ status: "already_member", teamName: "Acme Corp", role: "viewer" }));
    expectNoWrites();
  });

  it("keeps GET /teams/invites/pending as the incoming invite list", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ email: "invitee@example.com" }]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([{ id: "invite-1", teamName: "Acme Corp" }]);

    const response = await handleTeams(previewRequest("pending"), mockEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "invite-1", teamName: "Acme Corp" }]);
  });
});

describe("Organization invite decline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue(dbMocks.insertChain);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.insertChain.select.mockReturnValue(dbMocks.insertChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
  });

  const declineRequest = () =>
    new Request("http://localhost/api/teams/invites/invite-token/decline", { method: "POST" });

  it("revokes a pending invite for the invited account and records it", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([inviteRow()])
      .mockResolvedValueOnce([{ email: "invitee@example.com" }]);

    const response = await handleTeams(declineRequest(), mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: expect.any(String) }),
    );
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team_invite.declined", actorUserId: "user-1" }),
    );
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  });

  it("writes the decline audit row only if this request revoked the invite, checking the row the revoke left", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([inviteRow()])
      .mockResolvedValueOnce([{ email: "invitee@example.com" }]);

    await handleTeams(declineRequest(), mockEnv);

    const revokeThenAuditOfItsRow = [dbMocks.updateChain, dbMocks.insertChain];
    expect(dbMocks.db.batch.mock.calls[0][0]).toEqual(revokeThenAuditOfItsRow);
    const revokedAt = dbMocks.updateChain.set.mock.calls[0][0].revoked_at;
    const query = conditionalAuditQuery();
    expect(query.sql).toMatch(/exists \(\s*select 1\s+from "team_invites"/);
    expect(query.sql).toContain('"team_invites"."id" = ?');
    expect(query.sql).toContain('"team_invites"."revoked_at" = ?');
    expect(query.params).toEqual(expect.arrayContaining(["invite-1", revokedAt]));
  });

  it("returns 404, not success, when the invite is accepted in another tab during the decline", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([inviteRow()])
      .mockResolvedValueOnce([{ email: "invitee@example.com" }]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const response = await handleTeams(declineRequest(), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBeUndefined();
  });

  it("does not let another account decline the invite", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([inviteRow()])
      .mockResolvedValueOnce([{ email: "someone-else@example.com" }]);

    const response = await handleTeams(declineRequest(), mockEnv);

    expect(response.status).toBe(403);
    expectNoWrites();
  });

  it("returns 404 for an invite that was already accepted", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      inviteRow({ accepted_at: "2026-01-02T00:00:00.000Z", accepted_by_user_id: "user-1" }),
    ]);

    const response = await handleTeams(declineRequest(), mockEnv);

    expect(response.status).toBe(404);
    expectNoWrites();
  });
});

describe("Leaving an Organization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    const membershipLookupChainsOn = dbMocks.selectChain;
    const pendingInvitesTheLeaverCreated: never[] = [];
    dbMocks.selectChain.where.mockReset().mockReturnValueOnce(membershipLookupChainsOn).mockResolvedValue(pendingInvitesTheLeaverCreated);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue(dbMocks.insertChain);
    dbMocks.insertChain.select.mockReturnValue(dbMocks.insertChain);
    dbMocks.deleteChain.where.mockReturnValue(dbMocks.deleteChain);
    dbMocks.db.batch.mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
  });

  const leaveRequest = () =>
    new Request("http://localhost/api/teams/team-1/leave", { method: "POST" });

  it.each(["admin", "editor", "runner", "viewer"])("lets a %s leave and records it", async (role) => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role, status: "active" },
    ]);

    const response = await handleTeams(leaveRequest(), mockEnv);

    expect(response.status).toBe(200);
    expect(dbMocks.db.delete).toHaveBeenCalledTimes(1);
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team_member.left",
        actorUserId: "user-1",
        resource: { type: "team_member", id: "member-1" },
      }),
    );
    expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
  });

  it("writes the leave audit row only if the membership can still be removed, before the delete since a deleted row leaves nothing to check", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "editor", status: "active" },
    ]);

    await handleTeams(leaveRequest(), mockEnv);

    const auditOnTheDeleteConditionThenDelete = [dbMocks.insertChain, dbMocks.deleteChain];
    expect(dbMocks.db.batch.mock.calls[0][0]).toEqual(auditOnTheDeleteConditionThenDelete);
    const query = conditionalAuditQuery();
    expect(query.sql).toMatch(/exists \(\s*select 1\s+from "team_members"/);
    for (const column of ["id", "team_id", "user_id"]) {
      expect(query.sql).toContain(`"team_members"."${column}" = ?`);
    }
    expect(query.sql).toContain('"team_members"."role" <> ?');
    expect(query.params).toEqual(expect.arrayContaining(["member-1", "team-1", "user-1", "owner"]));
  });

  it("returns 409, not success, when ownership moves to the member or they leave in another tab during the leave", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "editor", status: "active" },
    ]);
    const membershipChangedAfterTheRead = [{ meta: { changes: 0 } }, { meta: { changes: 0 } }];
    dbMocks.db.batch.mockResolvedValueOnce(membershipChangedAfterTheRead);

    const response = await handleTeams(leaveRequest(), mockEnv);
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("membership_changed");
    expect(data.success).toBeUndefined();
  });

  it("asks the owner to transfer ownership first", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "owner", status: "active" },
    ]);

    const response = await handleTeams(leaveRequest(), mockEnv);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("owner_must_transfer");
    expectNoWrites();
  });

  it("returns 404 when the user is not an active member", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const response = await handleTeams(leaveRequest(), mockEnv);

    expect(response.status).toBe(404);
    expectNoWrites();
  });
});
