import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  asUser,
  createInvite,
  createdAt,
  d1,
  expectOneActiveOwnerAndClose,
  listAsUser,
  newUserMembership,
  openTheSeededOrganization,
  revocationAndAcceptance,
} from "../../../support/teamsSqlite";

const accept = (token: string) => asUser("new-user", "POST", `/invites/${token}/accept`);

describe("accepting an invite the API refuses, against SQLite", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  it("answers 404 once the Organization is archived, and adds no member", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");
    d1.run("UPDATE teams SET archived_at = ? WHERE id = 'team-1'", createdAt);

    expect(await accept(invite.token)).toMatchObject({ status: 404, data: { error: "Organization not found" } });
    expect(newUserMembership()).toEqual([]);
  });

  it("answers 404 to an invite someone else already accepted", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");
    d1.run("UPDATE team_invites SET accepted_at = ?, accepted_by_user_id = 'other-user' WHERE id = ?", createdAt, invite.id);

    expect(await accept(invite.token)).toMatchObject({ status: 404, data: { error: "Invite not found" } });
    expect(newUserMembership()).toEqual([]);
  });

  it("answers 410 to an invite past its expiry", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");
    d1.run("UPDATE team_invites SET expires_at = ? WHERE id = ?", createdAt, invite.id);

    expect(await accept(invite.token)).toMatchObject({ status: 410, data: { error: "Invite expired" } });
    expect(revocationAndAcceptance(invite.id)).toEqual({ revoked_at: null, accepted_at: null });
  });

  it("answers 409 when a suspended membership for the user lands while the acceptance is written", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "editor");
    d1.beforeNextBatch(async () => {
      d1.run(
        `INSERT INTO team_members (id, team_id, user_id, role, status, created_at, updated_at)
         VALUES ('member-new', 'team-1', 'new-user', 'viewer', 'suspended', ?, ?)`,
        createdAt, createdAt,
      );
    });

    expect(await accept(invite.token)).toMatchObject({ status: 409, data: { code: "invite_acceptance_conflict" } });
    expect(newUserMembership()).toEqual([{ role: "viewer", status: "suspended" }]);
  });
});

describe("the incoming invites of a signed-in user with no stored account", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  it("lists none, even with invites pending", async () => {
    await createInvite("admin-user", "new@example.test", "viewer");

    expect(await listAsUser("deleted-user", "/invites/pending")).toEqual({ status: 200, data: [] });
  });
});

describe("previewing and declining an invite the API refuses, against SQLite", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  it("answers 404 to a preview of an accepted invite once the member who accepted it has left", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");
    expect((await accept(invite.token)).status).toBe(200);
    d1.run("DELETE FROM team_members WHERE user_id = 'new-user'");

    expect(await asUser("new-user", "GET", `/invites/${invite.token}`)).toMatchObject({ status: 404, data: { error: "Invite not found" } });
  });

  it("answers a preview from a signed-in user with no stored account as a different email", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");

    expect(await asUser("deleted-user", "GET", `/invites/${invite.token}`))
      .toMatchObject({ status: 403, data: { code: "invite_email_mismatch" } });
  });

  it("answers 410 to declining an invite past its expiry and leaves it unrevoked", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");
    d1.run("UPDATE team_invites SET expires_at = ? WHERE id = ?", createdAt, invite.id);

    expect(await asUser("new-user", "POST", `/invites/${invite.token}/decline`))
      .toMatchObject({ status: 410, data: { code: "invite_expired" } });
    expect(revocationAndAcceptance(invite.id)).toEqual({ revoked_at: null, accepted_at: null });
  });
});
