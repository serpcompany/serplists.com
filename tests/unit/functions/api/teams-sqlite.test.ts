import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MigratedSqliteD1 } from "../../../support/sqlite-d1";

const sessionMocks = vi.hoisted(() => ({
  userId: "owner-user" as string | null,
}));

vi.mock("@functions/api/utils/session", () => ({
  getSessionUserId: vi.fn(async () => sessionMocks.userId),
}));

import { handleTeams } from "@functions/api/handlers/teams";

const createdAt = "2026-01-01T00:00:00.000Z";
let d1: MigratedSqliteD1;

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
    ["new-user", "new@example.test"],
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

describe("Organization membership writes against SQLite, which leave every Organization one active owner whatever interleaving ran", () => {
  beforeEach(() => {
    d1 = new MigratedSqliteD1();
    seedOrganization();
  });

  afterEach(() => {
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

  describe("member status changes and pending invites", () => {
    async function inviteMember(role = "editor") {
      const created = await asUser("admin-user", "POST", "/team-1/invites", { email: "member@example.test", role });
      expect(created.status).toBe(200);
      return created.data?.id as string;
    }

    function invite(id: string) {
      return d1.rows<{ revoked_at: string | null; accepted_at: string | null }>(
        "SELECT revoked_at, accepted_at FROM team_invites WHERE id = ?",
        id,
      )[0];
    }

    function revokedInviteAudits() {
      return d1.rows<{ resource_id: string; metadata_json: string | null }>(
        "SELECT resource_id, metadata_json FROM audit_events WHERE action = 'team_invite.revoked'",
      );
    }

    it("does not let a disabled member rejoin through an invite made before a re-enable", async () => {
      await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });
      const inviteId = await inviteMember();

      expect((await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "active" })).status).toBe(200);
      expect(invite(inviteId).revoked_at).not.toBeNull();
      expect(revokedInviteAudits()).toEqual([
        { resource_id: inviteId, metadata_json: JSON.stringify({ reason: "member_status_changed" }) },
      ]);
      expect((await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" })).status).toBe(200);

      const pending = await asUser("member-user", "GET", "/invites/pending");
      const accepted = await asUser("member-user", "POST", `/invites/pending/${inviteId}/accept`);

      expect(pending.data).toEqual([]);
      expect(accepted.status).toBe(404);
      expect(member("member-m")).toEqual({ role: "editor", status: "disabled" });
    });

    it("revokes a member's pending invites, whatever their stored case, when the member is disabled", async () => {
      d1.run(
        `INSERT INTO team_invites (id, team_id, email, role, token_hash, invited_by_user_id, expires_at, created_at)
         VALUES ('legacy-invite', 'team-1', 'Member@Example.TEST', 'admin', 'legacy-hash', 'admin-user', ?, ?)`,
        new Date(Date.now() + 60_000).toISOString(),
        createdAt,
      );

      await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });

      expect(invite("legacy-invite").revoked_at).not.toBeNull();
      expect(revokedInviteAudits().map(({ resource_id }) => resource_id)).toEqual(["legacy-invite"]);
    });

    it("keeps pending invites on role changes and on updates that repeat the current status", async () => {
      await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });
      const inviteId = await inviteMember();

      await asUser("admin-user", "PUT", "/team-1/members/member-m", { role: "viewer" });
      await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });

      expect(invite(inviteId).revoked_at).toBeNull();
      expect(revokedInviteAudits()).toEqual([]);
    });

    it("still lets a disabled member rejoin with an invite created after they were disabled", async () => {
      await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });
      const inviteId = await inviteMember("runner");

      const accepted = await asUser("member-user", "POST", `/invites/pending/${inviteId}/accept`);

      expect(accepted.status).toBe(200);
      expect(member("member-m")).toEqual({ role: "runner", status: "active" });
    });

    it("revokes nothing when the status change itself loses a race", async () => {
      await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });
      const inviteId = await inviteMember();
      d1.beforeNextBatch(() => d1.run("UPDATE team_members SET role = 'viewer' WHERE id = 'admin-member'"));

      const result = await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "active" });

      expect(result.status).toBe(409);
      expect(invite(inviteId).revoked_at).toBeNull();
      expect(revokedInviteAudits()).toEqual([]);
    });
  });

  describe("invites left over for someone who is already an active member, from before re-enabling revoked invites or a race with a re-enable", () => {
    function insertInvite(id: string, email: string, role: string) {
      d1.run(
        `INSERT INTO team_invites (id, team_id, email, role, token_hash, invited_by_user_id, expires_at, created_at)
         VALUES (?, 'team-1', ?, ?, ?, 'admin-user', ?, ?)`,
        id, email, role, `${id}-hash`, new Date(Date.now() + 60_000).toISOString(), createdAt,
      );
    }

    function inviteState(id: string) {
      return d1.rows<{ revoked_at: string | null; accepted_at: string | null }>(
        "SELECT revoked_at, accepted_at FROM team_invites WHERE id = ?",
        id,
      )[0];
    }

    it("hides the invite, refuses it without changing the role, and revokes it", async () => {
      insertInvite("stale-invite", "member@example.test", "admin");

      const incoming = await asUser("member-user", "GET", "/invites/pending");
      const accepted = await asUser("member-user", "POST", "/invites/pending/stale-invite/accept");

      expect(incoming.data).toEqual([]);
      expect(accepted.status).toBe(409);
      expect(accepted.data).toEqual(expect.objectContaining({
        error: "You are already a member of this Organization",
        code: "team_member_exists",
      }));
      expect(member("member-m")).toEqual({ role: "editor", status: "active" });
      expect(inviteState("stale-invite").accepted_at).toBeNull();
      expect(inviteState("stale-invite").revoked_at).not.toBeNull();
      expect(auditActions("team_invite.accepted")).toHaveLength(0);
      expect(d1.rows("SELECT metadata_json FROM audit_events WHERE action = 'team_invite.revoked'")).toEqual([
        { metadata_json: JSON.stringify({ reason: "invitee_already_member" }) },
      ]);
      expect((await asUser("admin-user", "GET", "/team-1/invites")).data).toEqual([]);
    });

    it("never changes the owner's role through an invite", async () => {
      insertInvite("owner-invite", "owner@example.test", "viewer");

      const accepted = await asUser("owner-user", "POST", "/invites/pending/owner-invite/accept");

      expect(accepted.status).toBe(409);
      expect(member("owner-member")).toEqual({ role: "owner", status: "active" });
    });

    it("cleans up an invite created while the member was being re-enabled", async () => {
      await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "disabled" });
      let inviteId = "";
      d1.beforeNextBatch(async () => {
        const created = await asUser("admin-user", "POST", "/team-1/invites", { email: "member@example.test", role: "admin" });
        expect(created.status).toBe(200);
        inviteId = created.data?.id as string;
      });
      expect((await asUser("admin-user", "PUT", "/team-1/members/member-m", { status: "active" })).status).toBe(200);
      expect(inviteState(inviteId).revoked_at).toBeNull();

      expect((await asUser("member-user", "GET", "/invites/pending")).data).toEqual([]);
      expect((await asUser("member-user", "POST", `/invites/pending/${inviteId}/accept`)).status).toBe(409);

      expect(member("member-m")).toEqual({ role: "editor", status: "active" });
      expect(inviteState(inviteId).revoked_at).not.toBeNull();
      expect((await asUser("admin-user", "GET", "/team-1/invites")).data).toEqual([]);
    });
  });

  describe("invites from a manager who loses access", () => {
    async function inviteNewUser(inviterUserId = "admin-user", role = "admin") {
      const created = await asUser(inviterUserId, "POST", "/team-1/invites", { email: "new@example.test", role });
      expect(created.status).toBe(200);
      return created.data?.id as string;
    }

    function inviteState(id: string) {
      return d1.rows<{ revoked_at: string | null; accepted_at: string | null }>(
        "SELECT revoked_at, accepted_at FROM team_invites WHERE id = ?",
        id,
      )[0];
    }

    function revokedInviteAudits() {
      return d1.rows<{ resource_id: string; metadata_json: string | null }>(
        "SELECT resource_id, metadata_json FROM audit_events WHERE action = 'team_invite.revoked'",
      );
    }

    function newUserMembership() {
      return d1.rows("SELECT role, status FROM team_members WHERE team_id = 'team-1' AND user_id = 'new-user'");
    }

    it.each([
      ["disabled", { status: "disabled" }],
      ["demoted below admin", { role: "editor" }],
    ])("revokes the pending invites an admin created when the admin is %s", async (_label, body) => {
      const inviteId = await inviteNewUser();

      expect((await asUser("owner-user", "PUT", "/team-1/members/admin-member", body)).status).toBe(200);

      expect(inviteState(inviteId).revoked_at).not.toBeNull();
      expect(revokedInviteAudits()).toEqual([
        { resource_id: inviteId, metadata_json: JSON.stringify({ reason: "inviter_access_removed" }) },
      ]);
      expect((await asUser("owner-user", "GET", "/team-1/invites")).data).toEqual([]);
      expect((await asUser("new-user", "GET", "/invites/pending")).data).toEqual([]);
      expect((await asUser("new-user", "POST", `/invites/pending/${inviteId}/accept`)).status).toBe(404);
      expect(newUserMembership()).toEqual([]);
    });

    it("does not bring the revoked invites back when the admin is re-enabled", async () => {
      const inviteId = await inviteNewUser();
      await asUser("owner-user", "PUT", "/team-1/members/admin-member", { status: "disabled" });

      expect((await asUser("owner-user", "PUT", "/team-1/members/admin-member", { status: "active" })).status).toBe(200);

      expect(inviteState(inviteId).revoked_at).not.toBeNull();
      expect((await asUser("new-user", "POST", `/invites/pending/${inviteId}/accept`)).status).toBe(404);
    });

    it("keeps invites when a manager stays a manager or a non-manager changes role", async () => {
      const adminInvite = await inviteNewUser();

      await asUser("owner-user", "PUT", "/team-1/members/admin-member", { role: "admin" });
      await asUser("owner-user", "PUT", "/team-1/members/member-m", { role: "viewer" });
      await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "admin-member" });

      expect(inviteState(adminInvite).revoked_at).toBeNull();
      expect(revokedInviteAudits()).toEqual([]);
      const accepted = await asUser("new-user", "POST", `/invites/pending/${adminInvite}/accept`);
      expect(accepted.status).toBe(200);
      expect(newUserMembership()).toEqual([{ role: "admin", status: "active" }]);
    });

    it("keeps an owner's invites valid after the owner transfers ownership and becomes an admin", async () => {
      const inviteId = await inviteNewUser("owner-user", "editor");

      expect((await asUser("owner-user", "PUT", "/team-1/owner", { memberId: "admin-member" })).status).toBe(200);

      expect((await asUser("new-user", "POST", `/invites/pending/${inviteId}/accept`)).status).toBe(200);
      expect(newUserMembership()).toEqual([{ role: "editor", status: "active" }]);
    });

    it("refuses and hides an invite whose inviter lost access some other way", async () => {
      const inviteId = await inviteNewUser();
      d1.run("UPDATE team_members SET role = 'viewer' WHERE id = 'admin-member'");

      expect((await asUser("new-user", "GET", "/invites/pending")).data).toEqual([]);
      expect((await asUser("new-user", "POST", `/invites/pending/${inviteId}/accept`)).status).toBe(404);
      expect(inviteState(inviteId)).toEqual({ revoked_at: null, accepted_at: null });
      expect(newUserMembership()).toEqual([]);
    });

    it("does not accept an invite whose inviter is disabled between the checks and the write", async () => {
      const inviteId = await inviteNewUser();
      d1.beforeNextBatch(() => d1.run("UPDATE team_members SET status = 'disabled' WHERE id = 'admin-member'"));

      const accepted = await asUser("new-user", "POST", `/invites/pending/${inviteId}/accept`);

      expect(accepted.status).toBe(409);
      expect(accepted.data?.code).toBe("invite_acceptance_conflict");
      expect(inviteState(inviteId).accepted_at).toBeNull();
      expect(newUserMembership()).toEqual([]);
      expect(auditActions("team_invite.accepted")).toHaveLength(0);
    });
  });

  describe("an invite whose link is reissued while it is being accepted", () => {
    async function inviteNewUser(role = "admin") {
      const created = await asUser("admin-user", "POST", "/team-1/invites", { email: "new@example.test", role });
      expect(created.status).toBe(200);
      return { id: created.data?.id as string, token: created.data?.inviteToken as string };
    }

    function inviteRow(id: string) {
      return d1.rows<{ role: string; accepted_at: string | null }>("SELECT role, accepted_at FROM team_invites WHERE id = ?", id)[0];
    }

    function newUserMembership() {
      return d1.rows("SELECT role, status FROM team_members WHERE team_id = 'team-1' AND user_id = 'new-user'");
    }

    function reissueBeforeTheAccept(inviteId: string, role: string) {
      let newToken = "";
      d1.beforeNextBatch(async () => {
        const reissued = await asUser("owner-user", "POST", `/team-1/invites/${inviteId}/link`, { role });
        expect(reissued.status).toBe(200);
        newToken = reissued.data?.inviteToken as string;
      });
      return () => newToken;
    }

    it.each([
      ["the old link", (invite: { token: string }) => `/invites/${invite.token}/accept`],
      ["the incoming list", (invite: { id: string }) => `/invites/pending/${invite.id}/accept`],
    ])("never grants the old role through %s, while the new link grants the new one", async (_label, acceptPath) => {
      const invite = await inviteNewUser("admin");
      const newToken = reissueBeforeTheAccept(invite.id, "viewer");

      const accepted = await asUser("new-user", "POST", acceptPath(invite));

      expect(accepted.status).toBe(409);
      expect(accepted.data?.code).toBe("invite_acceptance_conflict");
      expect(inviteRow(invite.id)).toEqual({ role: "viewer", accepted_at: null });
      expect(newUserMembership()).toEqual([]);
      expect(auditActions("team_invite.accepted")).toHaveLength(0);

      const acceptThroughTheOldLink = await asUser("new-user", "POST", `/invites/${invite.token}/accept`);
      expect(acceptThroughTheOldLink.status).toBe(404);
      const acceptThroughTheNewLink = await asUser("new-user", "POST", `/invites/${newToken()}/accept`);
      expect(acceptThroughTheNewLink.status).toBe(200);
      expect(newUserMembership()).toEqual([{ role: "viewer", status: "active" }]);
    });

    it("never re-enables a disabled member with the old role", async () => {
      d1.run(
        `INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at, updated_at)
         VALUES ('member-new', 'team-1', 'new-user', 'viewer', 'disabled', ?, ?, ?)`,
        createdAt, createdAt, createdAt,
      );
      const invite = await inviteNewUser("admin");
      reissueBeforeTheAccept(invite.id, "viewer");

      const accepted = await asUser("new-user", "POST", `/invites/pending/${invite.id}/accept`);

      expect(accepted.status).toBe(409);
      expect(member("member-new")).toEqual({ role: "viewer", status: "disabled" });
      expect(auditActions("team_invite.accepted")).toHaveLength(0);
    });

    it("still grants the invite's role when no new link is made", async () => {
      const invite = await inviteNewUser("editor");

      expect((await asUser("new-user", "POST", `/invites/${invite.token}/accept`)).status).toBe(200);
      expect(newUserMembership()).toEqual([{ role: "editor", status: "active" }]);
    });
  });

  describe("invites whose inviter left the Organization", () => {
    async function inviteNewUser(inviterUserId = "admin-user") {
      const created = await asUser(inviterUserId, "POST", "/team-1/invites", { email: "new@example.test", role: "editor" });
      expect(created.status).toBe(200);
      return { id: created.data?.id as string, token: created.data?.inviteToken as string };
    }

    function inviteRow(id: string) {
      return d1.rows<{ revoked_at: string | null; invited_by_user_id: string }>(
        "SELECT revoked_at, invited_by_user_id FROM team_invites WHERE id = ?",
        id,
      )[0];
    }

    function revokedInviteAudits() {
      return d1.rows<{ resource_id: string; metadata_json: string | null }>(
        "SELECT resource_id, metadata_json FROM audit_events WHERE action = 'team_invite.revoked'",
      );
    }

    function newUserMembership() {
      return d1.rows("SELECT role, status FROM team_members WHERE team_id = 'team-1' AND user_id = 'new-user'");
    }

    it("revokes the pending invites an admin created when the admin leaves", async () => {
      const invite = await inviteNewUser();

      expect((await asUser("admin-user", "POST", "/team-1/leave")).status).toBe(200);

      expect(inviteRow(invite.id).revoked_at).not.toBeNull();
      expect(revokedInviteAudits()).toEqual([
        { resource_id: invite.id, metadata_json: JSON.stringify({ reason: "inviter_left" }) },
      ]);
      expect((await asUser("owner-user", "GET", "/team-1/invites")).data).toEqual([]);
      expect((await asUser("new-user", "GET", `/invites/${invite.token}`)).status).toBe(404);

      const again = await asUser("owner-user", "POST", "/team-1/invites", { email: "new@example.test", role: "editor" });
      expect(again.status).toBe(200);
      expect((await asUser("new-user", "POST", `/invites/${again.data?.inviteToken}/accept`)).status).toBe(200);
      expect(newUserMembership()).toEqual([{ role: "editor", status: "active" }]);
    });

    it("does not bring the invites back when the admin rejoins as an admin", async () => {
      const invite = await inviteNewUser();
      await asUser("admin-user", "POST", "/team-1/leave");
      const rejoin = await asUser("owner-user", "POST", "/team-1/invites", { email: "admin@example.test", role: "admin" });
      expect((await asUser("admin-user", "POST", `/invites/${rejoin.data?.inviteToken}/accept`)).status).toBe(200);

      expect((await asUser("new-user", "GET", `/invites/${invite.token}`)).status).toBe(404);
      expect((await asUser("new-user", "POST", `/invites/${invite.token}/accept`)).status).toBe(404);
      expect(newUserMembership()).toEqual([]);
    });

    it("revokes nothing when the leave loses a race with an ownership transfer", async () => {
      const invite = await inviteNewUser();
      d1.beforeNextBatch(() => {
        d1.run("UPDATE team_members SET role = 'admin' WHERE id = 'owner-member'");
        d1.run("UPDATE team_members SET role = 'owner' WHERE id = 'admin-member'");
      });

      const left = await asUser("admin-user", "POST", "/team-1/leave");

      expect(left.status).toBe(409);
      expect(left.data?.code).toBe("membership_changed");
      expect(inviteRow(invite.id).revoked_at).toBeNull();
      expect(revokedInviteAudits()).toEqual([]);
    });

    it("hides an invite stranded by an inviter who left some other way and lets it be replaced", async () => {
      const invite = await inviteNewUser();
      d1.run("DELETE FROM team_members WHERE id = 'admin-member'");

      expect((await asUser("owner-user", "GET", "/team-1/invites")).data).toEqual([]);
      expect((await asUser("new-user", "GET", `/invites/${invite.token}`)).status).toBe(404);

      const replaced = await asUser("owner-user", "POST", "/team-1/invites", { email: "new@example.test", role: "viewer" });
      expect(replaced.status).toBe(200);
      expect((await asUser("new-user", "POST", `/invites/${replaced.data?.inviteToken}/accept`)).status).toBe(200);
      expect(newUserMembership()).toEqual([{ role: "viewer", status: "active" }]);
    });

    it("makes the manager who reissues a stranded invite's link its inviter", async () => {
      const invite = await inviteNewUser();
      d1.run("DELETE FROM team_members WHERE id = 'admin-member'");

      const reissued = await asUser("owner-user", "POST", `/team-1/invites/${invite.id}/link`);

      expect(reissued.status).toBe(200);
      expect(inviteRow(invite.id)).toEqual({ revoked_at: null, invited_by_user_id: "owner-user" });
      expect((await asUser("new-user", "GET", `/invites/${reissued.data?.inviteToken}`)).data?.status).toBe("pending");
      expect((await asUser("new-user", "POST", `/invites/${reissued.data?.inviteToken}/accept`)).status).toBe(200);
      expect(newUserMembership()).toEqual([{ role: "editor", status: "active" }]);
    });

    it("does not reissue a link for a manager who lost access before the write", async () => {
      const invite = await inviteNewUser("owner-user");
      d1.beforeNextBatch(() => d1.run("UPDATE team_members SET role = 'viewer' WHERE id = 'admin-member'"));

      const reissued = await asUser("admin-user", "POST", `/team-1/invites/${invite.id}/link`);

      expect(reissued.status).toBe(404);
      expect(reissued.data?.inviteToken).toBeUndefined();
      expect(inviteRow(invite.id).invited_by_user_id).toBe("owner-user");
    });
  });

  describe("invite revocation", () => {
    async function createInvite() {
      const created = await asUser("admin-user", "POST", "/team-1/invites", { email: "new@example.test", role: "viewer" });
      expect(created.status).toBe(200);
      return created.data?.id as string;
    }

    function revokedAudits() {
      return auditActions("team_invite.revoked");
    }

    function newUserMembership() {
      return d1.rows("SELECT role, status FROM team_members WHERE team_id = 'team-1' AND user_id = 'new-user'");
    }

    it("revokes a pending invite and records one audit event", async () => {
      const inviteId = await createInvite();

      const result = await asUser("admin-user", "DELETE", `/team-1/invites/${inviteId}`);

      expect(result).toEqual({ status: 200, data: { success: true } });
      expect(revokedAudits()).toHaveLength(1);
      expect(d1.rows("SELECT id FROM team_invites WHERE id = ? AND revoked_at IS NOT NULL", inviteId)).toHaveLength(1);
    });

    it("reports a conflict and logs nothing when the invite is accepted before the revoke writes", async () => {
      const inviteId = await createInvite();
      d1.beforeNextBatch(async () => {
        const accepted = await asUser("new-user", "POST", `/invites/pending/${inviteId}/accept`);
        expect(accepted.status).toBe(200);
      });

      const result = await asUser("admin-user", "DELETE", `/team-1/invites/${inviteId}`);

      expect(result.status).toBe(409);
      expect(result.data?.code).toBe("invite_already_accepted");
      expect(revokedAudits()).toHaveLength(0);
      expect(newUserMembership()).toEqual([{ role: "viewer", status: "active" }]);
    });

    it("logs one revoke when two revokes of the same invite share a timestamp", async () => {
      const inviteId = await createInvite();
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
      try {
        d1.beforeNextBatch(async () => {
          const first = await asUser("owner-user", "DELETE", `/team-1/invites/${inviteId}`);
          expect(first.status).toBe(200);
        });

        const result = await asUser("admin-user", "DELETE", `/team-1/invites/${inviteId}`);

        expect(result.status).toBe(404);
        expect(revokedAudits()).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("logs one revoke when two admins revoke the same invite at once", async () => {
      const inviteId = await createInvite();
      d1.beforeNextBatch(async () => {
        const first = await asUser("owner-user", "DELETE", `/team-1/invites/${inviteId}`);
        expect(first.status).toBe(200);
      });

      const result = await asUser("admin-user", "DELETE", `/team-1/invites/${inviteId}`);

      expect(result.status).toBe(404);
      expect(revokedAudits()).toHaveLength(1);
    });
  });

  describe("Organization slugs", () => {
    function teamSlugs() {
      return d1.rows<{ slug: string }>("SELECT slug FROM teams ORDER BY created_at, slug").map(({ slug }) => slug);
    }

    it("rejects a requested slug another Organization already uses, even an archived one", async () => {
      const taken = await asUser("new-user", "POST", "", { name: "Acme", slug: "acme" });
      d1.run("UPDATE teams SET archived_at = ? WHERE id = 'team-1'", createdAt);
      const takenByArchived = await asUser("new-user", "POST", "", { name: "Acme", slug: "acme" });

      expect(taken).toEqual({
        status: 409,
        data: { error: "Organization slug is already in use", code: "team_slug_exists" },
      });
      expect(takenByArchived.status).toBe(409);
      expect(teamSlugs()).toEqual(["acme"]);
      expect(auditActions("team.created")).toHaveLength(0);
      d1.run("UPDATE teams SET archived_at = NULL WHERE id = 'team-1'");
    });

    function insertCompetingTeam(slug: string) {
      d1.run(
        `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
         VALUES ('team-2', 'Competing', ?, 'other-user', 'other-user', ?)`,
        slug,
        createdAt,
      );
    }

    it("retries with a new slug when another request takes the name-derived slug before the write", async () => {
      d1.beforeNextBatch(() => insertCompetingTeam("marketing"));

      const created = await asUser("new-user", "POST", "", { name: "Marketing" });

      expect(created.status).toBe(200);
      expect(created.data?.slug).toMatch(/^marketing-[0-9a-f]{8}$/);
      const createdAudit = d1.rows<{ after_json: string }>("SELECT after_json FROM audit_events WHERE action = 'team.created'");
      expect(createdAudit.map(({ after_json }) => JSON.parse(after_json).team.slug)).toEqual([created.data?.slug]);
      expect(d1.rows("SELECT id FROM team_members WHERE user_id = 'new-user' AND role = 'owner'")).toHaveLength(1);
    });

    it("returns 409 when another request takes a requested slug before the write", async () => {
      d1.beforeNextBatch(() => insertCompetingTeam("marketing"));

      const created = await asUser("new-user", "POST", "", { name: "Marketing", slug: "marketing" });

      expect(created.status).toBe(409);
      expect(created.data?.code).toBe("team_slug_exists");
      expect(teamSlugs()).toEqual(["acme", "marketing"]);
      expect(auditActions("team.created")).toHaveLength(0);
    });

    it("returns 409 when another Organization saves the same new slug before the update writes", async () => {
      d1.beforeNextBatch(() => insertCompetingTeam("acme-ops"));

      const updated = await asUser("admin-user", "PUT", "/team-1", { slug: "acme-ops" });

      expect(updated.status).toBe(409);
      expect(updated.data?.code).toBe("team_slug_exists");
      expect(teamSlugs()).toEqual(["acme", "acme-ops"]);
      expect(auditActions("team.updated")).toHaveLength(0);
    });

    it("suffixes a slug derived from the name when it is taken", async () => {
      const created = await asUser("new-user", "POST", "", { name: "Acme" });

      expect(created.status).toBe(200);
      expect(created.data?.slug).toMatch(/^acme-[0-9a-f]{8}$/);
      expect(teamSlugs()).toEqual(["acme", created.data?.slug]);
    });
  });

  describe("incoming invites", () => {
    it("finds a signed-in user's invites through the email index, whatever the case of their email", async () => {
      d1.run("UPDATE users SET email = 'New@Example.TEST' WHERE id = 'new-user'");
      for (let i = 0; i < 25; i += 1) {
        d1.run(
          `INSERT INTO team_invites (id, team_id, email, role, token_hash, invited_by_user_id, expires_at, revoked_at, created_at)
           VALUES (?, 'team-1', ?, 'viewer', ?, 'admin-user', ?, ?, ?)`,
          `old-invite-${i}`, `someone${i}@example.test`, `old-hash-${i}`, createdAt, createdAt, createdAt,
        );
      }
      const created = await asUser("admin-user", "POST", "/team-1/invites", { email: "New@Example.test", role: "viewer" });
      d1.queries.splice(0);

      const pending = await asUser("new-user", "GET", "/invites/pending");

      expect(pending.data).toEqual([expect.objectContaining({ id: created.data?.id, teamId: "team-1" })]);
      const inviteQuery = d1.queries.find((query) => query.sql.includes('from "team_invites"'));
      expect(inviteQuery?.params).toContain("new@example.test");
      const plan = d1.queryPlan(inviteQuery!).join(" | ");
      expect(plan).toContain("USING INDEX idx_team_invites_email");
      expect(plan).not.toContain("SCAN team_invites");
      expect(plan).not.toMatch(/SCAN (team_members|active_manager|active_member)\b/);
      const inviterAndExistingMemberLookups = plan.match(/idx_team_members_team_user_unique/g);
      expect(inviterAndExistingMemberLookups).toHaveLength(2);
    });
  });
});
