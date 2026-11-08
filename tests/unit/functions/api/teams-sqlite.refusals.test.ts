import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asUser, createInvite, d1, expectOneActiveOwnerAndClose, member, openTheSeededOrganization, revocationAndAcceptance } from "../../../support/teamsSqlite";

describe("Organization requests the teams route refuses, against SQLite", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  it("answers a write to the collection that names no Organization with 404", async () => {
    expect(await asUser("owner-user", "PUT", "", { name: "Renamed" })).toMatchObject({ status: 404, data: { error: "Not Found" } });
  });

  it("answers 404 for an Organization that was archived while the member stayed active", async () => {
    d1.run("UPDATE teams SET archived_at = ? WHERE id = 'team-1'", "2026-02-01T00:00:00.000Z");

    expect(await asUser("member-user", "GET", "/team-1")).toMatchObject({ status: 404, data: { error: "Organization not found" } });
  });

  it.each([
    ["an invite token nobody was sent", "/invites/not-a-token/accept"],
    ["a pending invite id that does not exist", "/invites/pending/invite-missing/accept"],
  ])("answers 404 to accepting %s", async (_label, path) => {
    expect(await asUser("new-user", "POST", path)).toMatchObject({ status: 404, data: { error: "Invite not found" } });
  });

  it("refuses an editor's revoke of an invite and leaves it pending", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");

    expect(await asUser("member-user", "DELETE", `/team-1/invites/${invite.id}`))
      .toMatchObject({ status: 403, data: { error: "Forbidden" } });
    expect(revocationAndAcceptance(invite.id)).toEqual({ revoked_at: null, accepted_at: null });
  });

  it("refuses an editor's change to another member's role and keeps it", async () => {
    expect(await asUser("member-user", "PUT", "/team-1/members/member-x", { role: "admin" }))
      .toMatchObject({ status: 403, data: { error: "Forbidden" } });
    expect(member("member-x")).toEqual({ role: "viewer", status: "active" });
  });

  it.each([
    ["a role the endpoint cannot grant", { role: "owner" }, "Invalid enum value"],
    ["no field to change", {}, "No fields to update"],
  ])("refuses an admin's member update with %s", async (_label, body, error) => {
    const refusal = await asUser("admin-user", "PUT", "/team-1/members/member-x", body);

    expect(refusal.status).toBe(400);
    expect(String(refusal.data["error"])).toContain(error);
    expect(member("member-x")).toEqual({ role: "viewer", status: "active" });
  });

  it("refuses an invite to an address that is not an email and creates none", async () => {
    expect((await asUser("admin-user", "POST", "/team-1/invites", { email: "not-an-email", role: "viewer" })).status).toBe(400);
    expect(d1.rows("SELECT id FROM team_invites")).toEqual([]);
  });

  it("answers 404 to an update of a member who is not in the Organization", async () => {
    expect(await asUser("admin-user", "PUT", "/team-1/members/member-elsewhere", { role: "editor" }))
      .toMatchObject({ status: 404, data: { error: "Member not found" } });
  });

  it("refuses an ownership transfer that names no member and keeps the owner", async () => {
    expect((await asUser("owner-user", "PUT", "/team-1/owner", { memberId: " " })).status).toBe(400);
    expect(member("owner-member")).toEqual({ role: "owner", status: "active" });
  });
});
