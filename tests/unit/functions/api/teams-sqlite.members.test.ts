import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  auditActions,
  billingOwner,
  createdAt,
  createInvite,
  d1,
  expectOneActiveOwnerAndClose,
  member,
  openTheSeededOrganization,
  revocationAndAcceptance,
  revokedInviteAudits,
} from "../../../support/teamsSqlite";

describe("Organization membership writes against SQLite, which leave every Organization one active owner whatever interleaving ran", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

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
    const inviteMember = async (role = "editor") => (await createInvite("admin-user", "member@example.test", role)).id;

    const invite = revocationAndAcceptance;

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
});
