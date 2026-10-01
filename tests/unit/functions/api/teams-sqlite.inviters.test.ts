import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  auditActions,
  createInvite,
  d1,
  expectOneActiveOwnerAndClose,
  inviteColumns,
  listAsUser,
  newUserMembership,
  openTheSeededOrganization,
  revocationAndAcceptance,
  revokedInviteAudits,
} from "../../../support/teamsSqlite";

describe("Organization membership writes against SQLite, which leave every Organization one active owner whatever interleaving ran", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  describe("invites from a manager who loses access", () => {
    async function inviteNewUser(inviterUserId = "admin-user", role = "admin") {
      return (await createInvite(inviterUserId, "new@example.test", role)).id;
    }

    const inviteState = revocationAndAcceptance;

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
      expect((await listAsUser("owner-user", "/team-1/invites")).data).toEqual([]);
      expect((await listAsUser("new-user", "/invites/pending")).data).toEqual([]);
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

      expect((await listAsUser("new-user", "/invites/pending")).data).toEqual([]);
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

  describe("invites whose inviter left the Organization", () => {
    const inviteNewUser = (inviterUserId = "admin-user") => createInvite(inviterUserId, "new@example.test", "editor");

    const inviteRow = (id: string) =>
      inviteColumns<{ revoked_at: string | null; invited_by_user_id: string }>(id, "revoked_at, invited_by_user_id");

    async function expectTheInviteHiddenFromTheListAndItsLink(token: string) {
      expect((await listAsUser("owner-user", "/team-1/invites")).data).toEqual([]);
      expect((await asUser("new-user", "GET", `/invites/${token}`)).status).toBe(404);
    }

    async function expectANewInviteTheNewUserAccepts(role: string) {
      const replacement = await asUser("owner-user", "POST", "/team-1/invites", { email: "new@example.test", role });
      expect(replacement.status).toBe(200);
      expect((await asUser("new-user", "POST", `/invites/${replacement.data?.inviteToken}/accept`)).status).toBe(200);
      expect(newUserMembership()).toEqual([{ role, status: "active" }]);
    }

    it("revokes the pending invites an admin created when the admin leaves", async () => {
      const invite = await inviteNewUser();

      expect((await asUser("admin-user", "POST", "/team-1/leave")).status).toBe(200);

      expect(inviteRow(invite.id).revoked_at).not.toBeNull();
      expect(revokedInviteAudits()).toEqual([
        { resource_id: invite.id, metadata_json: JSON.stringify({ reason: "inviter_left" }) },
      ]);
      await expectTheInviteHiddenFromTheListAndItsLink(invite.token);

      await expectANewInviteTheNewUserAccepts("editor");
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

      await expectTheInviteHiddenFromTheListAndItsLink(invite.token);

      await expectANewInviteTheNewUserAccepts("viewer");
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
});
