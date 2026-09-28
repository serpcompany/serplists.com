import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SqliteD1 } from "../../../support/sqlite-d1";

const sessionMocks = vi.hoisted(() => ({
  userId: "owner-user" as string | null,
}));

vi.mock("@functions/api/utils/session", () => ({
  getSessionUserId: vi.fn(async () => sessionMocks.userId),
}));

import { handleTeams } from "@functions/api/handlers/teams";

const createdAt = "2026-01-01T00:00:00.000Z";
let d1: SqliteD1;

function env() {
  return { DB: d1.binding, BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" };
}

async function asUser(userId: string, method: string, path: string, body?: unknown) {
  sessionMocks.userId = userId;
  const response = await handleTeams(
    new Request(`http://localhost/api/teams${path}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env(),
  );
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { status: response.status, data };
}

function seedOrganization() {
  const users = [
    ["owner-user", "owner@example.test"],
    ["admin-user", "admin@example.test"],
    ["member-user", "member@example.test"],
    ["other-user", "other@example.test"],
  ];
  for (const [id, email] of users) {
    d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES (?, ?, ?, 1, ?)", id, email, id, createdAt);
  }
  d1.run(
    `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
     VALUES ('team-1', 'Acme', 'acme', 'owner-user', 'owner-user', ?)`,
    createdAt,
  );
  const members = [
    ["owner-member", "owner-user", "owner"],
    ["admin-member", "admin-user", "admin"],
    ["member-m", "member-user", "editor"],
    ["member-x", "other-user", "viewer"],
  ];
  for (const [id, userId, role] of members) {
    d1.run(
      `INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at, updated_at)
       VALUES (?, 'team-1', ?, ?, 'active', ?, ?, ?)`,
      id, userId, role, createdAt, createdAt, createdAt,
    );
  }
}

function member(id: string) {
  return d1.rows<{ role: string; status: string }>("SELECT role, status FROM team_members WHERE id = ?", id)[0];
}

function billingOwner() {
  return d1.rows<{ billing_owner_user_id: string }>("SELECT billing_owner_user_id FROM teams WHERE id = 'team-1'")[0]
    .billing_owner_user_id;
}

function auditActions(action: string) {
  return d1.rows("SELECT id FROM audit_events WHERE action = ?", action);
}

function activeOwners() {
  return d1.rows<{ id: string }>(
    "SELECT id FROM team_members WHERE team_id = 'team-1' AND role = 'owner' AND status = 'active'",
  ).map(({ id }) => id);
}

describe("Organization membership writes against SQLite", () => {
  beforeEach(() => {
    d1 = new SqliteD1();
    seedOrganization();
  });

  afterEach(() => {
    // Every Organization keeps exactly one active owner, whatever interleaving ran.
    expect(activeOwners()).toHaveLength(1);
    d1.sqlite.close();
  });

  describe("owner transfer", () => {
    it("transfers ownership, moves the billing owner, and records one audit event", async () => {
      const result = await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "member-m" });

      expect(result).toEqual({
        status: 200,
        data: { success: true, ownerMemberId: "member-m", ownerUserId: "member-user" },
      });
      expect(member("owner-member")).toEqual({ role: "admin", status: "active" });
      expect(member("member-m")).toEqual({ role: "owner", status: "active" });
      expect(billingOwner()).toBe("member-user");
      expect(auditActions("team.owner_transferred")).toHaveLength(1);
    });

    it("changes nothing and returns 409 when the target is disabled before the write", async () => {
      d1.beforeNextBatch(() => d1.run("UPDATE team_members SET status = 'disabled' WHERE id = 'member-m'"));

      const result = await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "member-m" });

      expect(result.status).toBe(409);
      expect(result.data?.code).toBe("owner_transfer_conflict");
      expect(member("owner-member")).toEqual({ role: "owner", status: "active" });
      expect(member("member-m")).toEqual({ role: "editor", status: "disabled" });
      expect(billingOwner()).toBe("owner-user");
      expect(auditActions("team.owner_transferred")).toHaveLength(0);
    });

    it("returns 409 instead of failing when another transfer to a different member lands first", async () => {
      d1.beforeNextBatch(async () => {
        const first = await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "member-x" });
        expect(first.status).toBe(200);
      });

      const result = await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "member-m" });

      expect(result.status).toBe(409);
      expect(result.data?.code).toBe("owner_transfer_conflict");
      expect(member("member-x")).toEqual({ role: "owner", status: "active" });
      expect(member("member-m")).toEqual({ role: "editor", status: "active" });
      expect(billingOwner()).toBe("other-user");
      expect(auditActions("team.owner_transferred")).toHaveLength(1);
    });

    it("treats a repeated transfer to the same member as done without a second audit event", async () => {
      d1.beforeNextBatch(async () => {
        const first = await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "member-m" });
        expect(first.status).toBe(200);
      });

      const result = await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "member-m" });

      expect(result.status).toBe(200);
      expect(member("member-m")).toEqual({ role: "owner", status: "active" });
      expect(member("owner-member")).toEqual({ role: "admin", status: "active" });
      expect(auditActions("team.owner_transferred")).toHaveLength(1);
    });

    it("changes nothing when the Organization is archived before the write", async () => {
      d1.beforeNextBatch(() => d1.run("UPDATE teams SET archived_at = ? WHERE id = 'team-1'", createdAt));

      const result = await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "member-m" });

      expect(result.status).toBe(409);
      expect(member("owner-member")).toEqual({ role: "owner", status: "active" });
      expect(member("member-m")).toEqual({ role: "editor", status: "active" });
      expect(auditActions("team.owner_transferred")).toHaveLength(0);
    });
  });

  describe("member updates", () => {
    it("updates a member and records an audit event", async () => {
      const result = await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });

      expect(result).toEqual({ status: 200, data: { success: true } });
      expect(member("member-m")).toEqual({ role: "editor", status: "disabled" });
      expect(auditActions("team_member.updated")).toHaveLength(1);
    });

    it.each([
      [{ status: "disabled" }],
      [{ role: "viewer" }],
    ])("does not apply %o to a member who became owner after the request was checked", async (body) => {
      d1.beforeNextBatch(async () => {
        const transfer = await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "member-m" });
        expect(transfer.status).toBe(200);
      });

      const result = await asUser("admin-user", "PUT", "/team-1/members/member-m", body);

      expect(result.status).toBe(409);
      expect(result.data?.code).toBe("member_update_conflict");
      expect(member("member-m")).toEqual({ role: "owner", status: "active" });
      expect(auditActions("team_member.updated")).toHaveLength(0);
    });

    it("does not apply an update from an admin who lost the admin role after the request was checked", async () => {
      d1.beforeNextBatch(() => d1.run("UPDATE team_members SET role = 'viewer' WHERE id = 'admin-member'"));

      const result = await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });

      expect(result.status).toBe(409);
      expect(result.data?.code).toBe("member_update_conflict");
      expect(member("member-m")).toEqual({ role: "editor", status: "active" });
      expect(auditActions("team_member.updated")).toHaveLength(0);
    });
  });
});
