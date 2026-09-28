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
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    batch: vi.fn(),
    transaction: vi.fn((callback) => callback(db)),
  };

  return { selectChain, insertChain, updateChain, db };
});

const sessionMocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  buildAuditEventValues: vi.fn(async (input: {
    actorUserId: string | null;
    subject: { type: string; id: string };
    resource: { type: string; id: string };
    action: string;
    before?: unknown;
    after?: unknown;
    diff?: unknown;
    metadata?: unknown;
    createdAt?: string;
  }) => ({
    id: "audit-event",
    actor_user_id: input.actorUserId,
    subject_type: input.subject.type,
    subject_id: input.subject.id,
    resource_type: input.resource.type,
    resource_id: input.resource.id,
    action: input.action,
    before_json: typeof input.before === "undefined" ? null : JSON.stringify(input.before),
    after_json: typeof input.after === "undefined" ? null : JSON.stringify(input.after),
    diff_json: typeof input.diff === "undefined" ? null : JSON.stringify(input.diff),
    metadata_json: typeof input.metadata === "undefined" ? null : JSON.stringify(input.metadata),
    request_id: null,
    ip_hash: null,
    user_agent: null,
    created_at: input.createdAt ?? "2026-01-01T00:00:00.000Z",
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

function collectSqlColumnNames(value: unknown, seen = new Set<unknown>()): string[] {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return [];
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  const names = typeof record.name === "string" ? [record.name] : [];
  const chunks = Array.isArray(record.queryChunks) ? record.queryChunks : [];

  return [
    ...names,
    ...chunks.flatMap((chunk) => collectSqlColumnNames(chunk, seen)),
  ];
}

describe("Teams handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.selectChain.from.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.leftJoin.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.where.mockReturnValue(dbMocks.selectChain);
    dbMocks.selectChain.orderBy.mockResolvedValue([]);
    dbMocks.selectChain.limit.mockResolvedValue([]);
    dbMocks.insertChain.values.mockReturnValue(dbMocks.insertChain);
    dbMocks.insertChain.select.mockReturnValue(dbMocks.insertChain);
    dbMocks.insertChain.onConflictDoNothing.mockReturnValue(dbMocks.insertChain);
    dbMocks.updateChain.set.mockReturnValue(dbMocks.updateChain);
    dbMocks.updateChain.where.mockReturnValue(dbMocks.updateChain);
    dbMocks.db.batch.mockResolvedValue([]);
    dbMocks.db.transaction.mockImplementation((callback) => callback(dbMocks.db));
    auditMocks.buildAuditEventValues.mockClear();
    sessionMocks.getSessionUserId.mockResolvedValue("user-1");
  });

  it("rejects unauthenticated access", async () => {
    sessionMocks.getSessionUserId.mockResolvedValue(null);

    const response = await handleTeams(new Request("http://localhost/api/teams"), mockEnv);

    expect(response.status).toBe(401);
  });

  it("creates a team and owner membership", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams", {
        method: "POST",
        body: JSON.stringify({ name: "Acme Team" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        memberId: expect.any(String),
        membershipStatus: "active",
        name: "Acme Team",
      }),
    );
    expect(data.slug).toBe("acme-team");
    expect(data.role).toBe("owner");

    const insertedTeam = dbMocks.insertChain.values.mock.calls[0][0];
    const insertedMembership = dbMocks.insertChain.values.mock.calls[1][0];
    expect(insertedTeam.name).toBe("Acme Team");
    expect(insertedTeam.billing_owner_user_id).toBe("user-1");
    expect(insertedMembership.role).toBe("owner");
    expect(insertedMembership.user_id).toBe("user-1");
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "user-1",
        action: "team.created",
      }),
    );
  });

  it("rejects team creation with an explicitly requested slug that is taken", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ id: "other-team" }]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams", {
        method: "POST",
        body: JSON.stringify({ name: "Acme", slug: "acme" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data).toEqual({ error: "Organization slug is already in use", code: "team_slug_exists" });
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("creates a team with an explicitly requested free slug unchanged", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams", {
        method: "POST",
        body: JSON.stringify({ name: "Acme", slug: "acme" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.slug).toBe("acme");
    expect(dbMocks.insertChain.values.mock.calls[0][0].slug).toBe("acme");
  });

  it("suffixes a name-derived slug that is taken", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ id: "other-team" }]).mockResolvedValueOnce([]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams", {
        method: "POST",
        body: JSON.stringify({ name: "Acme" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.slug).toMatch(/^acme-[0-9a-f]{8}$/);
    expect(dbMocks.insertChain.values.mock.calls[0][0].slug).toBe(data.slug);
  });

  describe("slug races between the check and the write", () => {
    const slugViolation = () => new Error("D1_ERROR: UNIQUE constraint failed: teams.slug: SQLITE_CONSTRAINT");

    function createRequest(body: unknown) {
      return new Request("http://localhost/api/teams", { method: "POST", body: JSON.stringify(body) });
    }

    function createdAuditSlugs() {
      return auditMocks.buildAuditEventValues.mock.calls
        .map(([input]) => input)
        .filter((input) => input.action === "team.created")
        .map((input) => (input.after as { team: { slug: string } }).team.slug);
    }

    it("retries a name-derived slug that another request took and records the slug it wrote", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugViolation()).mockResolvedValueOnce([]);

      const response = await handleTeams(createRequest({ name: "Marketing" }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(2);
      expect(data.slug).toMatch(/^marketing-[0-9a-f]{8}$/);
      const insertedTeams = dbMocks.insertChain.values.mock.calls
        .map(([values]) => values)
        .filter((values) => "billing_owner_user_id" in values);
      expect(insertedTeams.map((team) => team.slug)).toEqual(["marketing", data.slug]);
      expect(createdAuditSlugs()).toEqual(["marketing", data.slug]);
    });

    it("gives up with a 409 after a bounded number of slug collisions", async () => {
      dbMocks.db.batch.mockRejectedValue(slugViolation());

      const response = await handleTeams(createRequest({ name: "Marketing" }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.code).toBe("team_slug_exists");
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(3);
    });

    it("returns 409 without retrying when a requested slug is taken between the check and the write", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugViolation());

      const response = await handleTeams(createRequest({ name: "Marketing", slug: "marketing" }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: "Organization slug is already in use", code: "team_slug_exists" });
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["another unique index", "D1_ERROR: UNIQUE constraint failed: team_members.team_id, team_members.user_id"],
      ["a similarly named column", "D1_ERROR: UNIQUE constraint failed: teams.slug_history"],
      ["any other failure", "D1_ERROR: database is locked"],
    ])("rethrows %s instead of treating it as a slug conflict", async (_label, message) => {
      dbMocks.db.batch.mockRejectedValueOnce(new Error(message));

      await expect(handleTeams(createRequest({ name: "Marketing" }), mockEnv)).rejects.toThrow(message);
      expect(dbMocks.db.batch).toHaveBeenCalledTimes(1);
    });

    it("recognizes the slug conflict when it is wrapped as the cause of another error", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(new Error("Failed query", { cause: slugViolation() }));

      const response = await handleTeams(createRequest({ name: "Marketing", slug: "marketing" }), mockEnv);

      expect(response.status).toBe(409);
    });

    function updateRequest(body: { name?: string; slug?: string }) {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce([
          { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
        ])
        .mockResolvedValueOnce([{ id: "team-1", name: "Old Team", slug: "old-team", archived_at: null }]);
      if (body.slug) {
        dbMocks.selectChain.limit.mockResolvedValueOnce([]); // the slug looks free when checked
      }
      return new Request("http://localhost/api/teams/team-1", { method: "PUT", body: JSON.stringify(body) });
    }

    it("returns 409 when another Organization saves the same new slug first", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugViolation());

      const response = await handleTeams(updateRequest({ slug: "new-team" }), mockEnv);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: "Organization slug is already in use", code: "team_slug_exists" });
    });

    it("rethrows a slug error from an update that did not change the slug", async () => {
      dbMocks.db.batch.mockRejectedValueOnce(slugViolation());

      await expect(handleTeams(updateRequest({ name: "New Team" }), mockEnv)).rejects.toThrow("teams.slug");
    });
  });

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
    const data = await response.json();

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
    const data = await response.json();
    const memberListPredicate = dbMocks.selectChain.where.mock.calls[1]?.[0];

    expect(response.status).toBe(200);
    expect(data[0]).toEqual(expect.objectContaining({ id: "member-disabled" }));
    expect(collectSqlColumnNames(memberListPredicate)).not.toContain("status");
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
    expect(collectSqlColumnNames(memberListPredicate)).toContain("status");
  });

  it("updates team profile fields for team admins and records audit history", async () => {
    const team = {
      id: "team-1",
      name: "Old Team",
      slug: "old-team",
      billing_owner_user_id: "user-1",
      created_by_user_id: "user-1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: null,
      archived_at: null,
    };
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([team])
      .mockResolvedValueOnce([]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1", {
        method: "PUT",
        body: JSON.stringify({ name: "New Team", slug: "new-team" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.team).toEqual(expect.objectContaining({ name: "New Team", slug: "new-team" }));
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Team",
        slug: "new-team",
        updated_at: expect.any(String),
      }),
    );
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.updated",
        before: team,
        diff: expect.objectContaining({ name: "New Team", slug: "new-team" }),
      }),
    );
  });

  it("rejects team slug updates that collide with another team", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        {
          id: "team-1",
          name: "Old Team",
          slug: "old-team",
          billing_owner_user_id: "user-1",
          created_by_user_id: "user-1",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: null,
          archived_at: null,
        },
      ])
      .mockResolvedValueOnce([{ id: "team-2" }]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1", {
        method: "PUT",
        body: JSON.stringify({ slug: "taken-team" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("team_slug_exists");
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: "Old Team", slug: "old-team" }],
    [{ name: "  Old Team  " }],
    [{ slug: "old-team" }],
  ])("treats saving %o over identical Organization settings as a no-op success", async (body) => {
    const team = {
      id: "team-1",
      name: "Old Team",
      slug: "old-team",
      billing_owner_user_id: "user-1",
      created_by_user_id: "user-1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: null,
      archived_at: null,
    };
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([team]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      team: { ...team, membership: { id: "member-1", role: "admin", status: "active" } },
    });
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("still rejects an Organization update that names no fields", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1", { method: "PUT", body: JSON.stringify({}) }),
      mockEnv,
    );

    expect(response.status).toBe(400);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it("rejects team profile updates for non-admin team members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "editor", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1", {
        method: "PUT",
        body: JSON.stringify({ name: "New Team" }),
      }),
      mockEnv,
    );

    expect(response.status).toBe(403);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("rejects invite creation for non-admin team members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "viewer", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites", {
        method: "POST",
        body: JSON.stringify({ email: "new@example.com", role: "viewer" }),
      }),
      mockEnv,
    );

    expect(response.status).toBe(403);
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it("creates hashed team invites for admins", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites", {
        method: "POST",
        headers: {
          Origin: "https://app.serplists.test",
        },
        body: JSON.stringify({ email: "New@Example.com", role: "editor" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.email).toBe("new@example.com");
    expect(data.role).toBe("editor");
    expect(typeof data.inviteToken).toBe("string");
    expect(data.invitePath).toBe(`/team-invites/${encodeURIComponent(data.inviteToken)}`);
    expect(data.inviteUrl).toBe(`https://app.serplists.test/team-invites/${encodeURIComponent(data.inviteToken)}`);
    expect(data.delivery).toEqual({
      mode: "link",
      status: "ready",
      invitePath: data.invitePath,
      inviteUrl: data.inviteUrl,
    });

    const insertedInvite = dbMocks.insertChain.values.mock.calls[0][0];
    expect(insertedInvite.token_hash).not.toBe(data.inviteToken);
    expect(insertedInvite.email).toBe("new@example.com");
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      expect.objectContaining({ action: "team_invite.created" }),
    );
  });

  it("lists pending invites for team admins", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
    ]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: "invite-1",
        team_id: "team-1",
        email: "new@example.com",
        role: "editor",
        invited_by_user_id: "user-1",
        expires_at: expiresAt,
        created_at: "2026-01-01T00:00:00.000Z",
        inviterEmail: "admin@example.com",
        inviterName: "Admin User",
      },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites"),
      mockEnv,
    );
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
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    dbMocks.selectChain.limit.mockResolvedValueOnce([{ email: "new@example.com" }]);
    dbMocks.selectChain.orderBy.mockResolvedValueOnce([
      {
        id: "invite-1",
        teamId: "team-1",
        teamName: "Acme Team",
        teamSlug: "acme-team",
        email: "new@example.com",
        role: "viewer",
        expiresAt,
        createdAt: "2026-01-01T00:00:00.000Z",
        inviterEmail: "owner@example.com",
        inviterName: "Owner User",
      },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/pending"),
      mockEnv,
    );
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
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "runner", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites"),
      mockEnv,
    );

    expect(response.status).toBe(403);
    expect(dbMocks.selectChain.orderBy).not.toHaveBeenCalled();
  });

  it("lists team activity for team admins", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        {
          id: "event-1",
          actor_user_id: "user-1",
          resource_type: "template",
          resource_id: "template-1",
          action: "template.updated",
          metadata_json: '{"field":"title"}',
          request_id: "request-1",
          created_at: "2026-01-01T00:00:00.000Z",
          actorEmail: "admin@example.com",
          actorName: "Admin User",
          actorUsername: "admin",
        },
      ]);
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/activity?limit=10"),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(dbMocks.selectChain.limit).toHaveBeenLastCalledWith(10);
    expect(data).toEqual([
      expect.objectContaining({
        id: "event-1",
        action: "template.updated",
        resource: { type: "template", id: "template-1" },
        metadata: { field: "title" },
        actor: expect.objectContaining({
          email: "admin@example.com",
          name: "Admin User",
        }),
      }),
    ]);
  });

  it("rejects team activity listing for non-admin team members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "viewer", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/activity"),
      mockEnv,
    );

    expect(response.status).toBe(403);
    expect(dbMocks.selectChain.orderBy).not.toHaveBeenCalled();
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
    const data = await response.json();

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
    const data = await response.json();

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
    const data = await response.json();

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
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("member_update_conflict");
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
    expect(dbMocks.insertChain.select).toHaveBeenCalled();
  });

  it("rejects invites for users who are already active members", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([{ id: "member-2" }]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites", {
        method: "POST",
        body: JSON.stringify({ email: "member@example.com", role: "viewer" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("team_member_exists");
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

  it("rejects duplicate pending team invites", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "invite-existing", expires_at: new Date(Date.now() + 60_000).toISOString() }]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites", {
        method: "POST",
        body: JSON.stringify({ email: "New@Example.com", role: "editor" }),
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("team_invite_exists");
    expect(data.details.inviteId).toBe("invite-existing");
    expect(dbMocks.insertChain.values).not.toHaveBeenCalled();
  });

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
      .mockResolvedValueOnce([{ id: "invite-1" }])
      .mockResolvedValueOnce([
        { id: "member-created", team_id: "team-1", user_id: "user-1", role: "editor", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/invite-token/accept", { method: "POST" }),
      mockEnv,
    );
    const data = await response.json();

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
      .mockResolvedValueOnce([]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/invite-token/accept", { method: "POST" }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("invite_acceptance_conflict");
    expect(dbMocks.db.batch).toHaveBeenCalled();
    expect(dbMocks.insertChain.select).toHaveBeenCalled();
    expect(dbMocks.insertChain.onConflictDoNothing).toHaveBeenCalled();
  });

  it("accepts an invite without downgrading an already active member", async () => {
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
      .mockResolvedValueOnce([{ id: "invite-1" }])
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/invites/invite-token/accept", { method: "POST" }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.role).toBe("admin");
    expect(dbMocks.insertChain.values).not.toHaveBeenCalledWith(
      expect.objectContaining({
        team_id: "team-1",
        user_id: "user-1",
        role: "viewer",
      }),
    );
    expect(dbMocks.updateChain.set).not.toHaveBeenCalledWith(
      expect.objectContaining({
        role: "viewer",
        status: "active",
      }),
    );
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        accepted_by_user_id: "user-1",
        accepted_at: expect.any(String),
      }),
    );
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

  it("revokes pending invites for team admins", async () => {
    const invite = {
      id: "invite-1",
      team_id: "team-1",
      email: "new@example.com",
      role: "viewer",
      token_hash: "hashed-token",
      invited_by_user_id: "user-1",
      accepted_by_user_id: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      accepted_at: null,
      revoked_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: null,
    };
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([invite]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites/invite-1", {
        method: "DELETE",
      }),
      mockEnv,
    );
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
        before: invite,
      }),
    );
  });

  it("does not revoke invites that have already been accepted", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "new@example.com",
          role: "viewer",
          token_hash: "hashed-token",
          invited_by_user_id: "user-1",
          accepted_by_user_id: "user-2",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          accepted_at: "2026-01-01T00:00:00.000Z",
          revoked_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: null,
        },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites/invite-1", {
        method: "DELETE",
      }),
      mockEnv,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("does not revoke expired invites", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        {
          id: "invite-1",
          team_id: "team-1",
          email: "new@example.com",
          role: "viewer",
          token_hash: "hashed-token",
          invited_by_user_id: "user-1",
          accepted_by_user_id: null,
          expires_at: new Date(Date.now() - 60_000).toISOString(),
          accepted_at: null,
          revoked_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: null,
        },
      ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites/invite-1", {
        method: "DELETE",
      }),
      mockEnv,
    );

    expect(response.status).toBe(404);
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });

  it("reports a conflict instead of a revoke when the invite was accepted between read and write", async () => {
    const pendingInvite = {
      id: "invite-1",
      team_id: "team-1",
      email: "new@example.com",
      role: "viewer",
      token_hash: "hashed-token",
      invited_by_user_id: "user-1",
      accepted_by_user_id: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      accepted_at: null,
      revoked_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: null,
    };
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([pendingInvite])
      .mockResolvedValueOnce([{ accepted_at: "2026-01-02T00:00:00.000Z" }]);
    dbMocks.db.batch.mockResolvedValueOnce([{ meta: { changes: 0 } }, { meta: { changes: 0 } }]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/invites/invite-1", {
        method: "DELETE",
      }),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe("invite_already_accepted");
    expect(data.success).toBeUndefined();
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
    const data = await response.json();

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
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe("owner_membership_update_forbidden");
    expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
    expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
  });
});
