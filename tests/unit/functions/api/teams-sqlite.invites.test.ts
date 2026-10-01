import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asUser, auditActions, createdAt, d1, expectOneActiveOwnerAndClose, member, openTheSeededOrganization } from "../../../support/teamsSqlite";

describe("Organization membership writes against SQLite, which leave every Organization one active owner whatever interleaving ran", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

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
