import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asUser,
  createInvite,
  d1,
  expectOneActiveOwnerAndClose,
  inviteColumns,
  newUserMembership,
  openTheSeededOrganization,
  revocationAndAcceptance,
} from "../../../support/teamsSqlite";

const tokenHashingFails = () => vi.spyOn(crypto.subtle, "digest").mockRejectedValue(new Error("SHA-256 is unavailable"));

describe("invite links when the runtime can't hash their tokens, against SQLite", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(() => {
    vi.restoreAllMocks();
    expectOneActiveOwnerAndClose();
  });

  it("refuses to create an invite whose token it can't hash, and stores none", async () => {
    tokenHashingFails();

    expect(await asUser("admin-user", "POST", "/team-1/invites", { email: "new@example.test", role: "viewer" }))
      .toMatchObject({ status: 500, data: { error: "Unable to create invite token" } });
    expect(d1.rows("SELECT id FROM team_invites")).toEqual([]);
  });

  it("refuses to reissue a link whose new token it can't hash, and keeps the link already sent", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");
    const before = inviteColumns(invite.id, "token_hash, expires_at");
    tokenHashingFails();

    expect(await asUser("admin-user", "POST", `/team-1/invites/${invite.id}/link`, {}))
      .toMatchObject({ status: 500, data: { error: "Unable to create invite token" } });
    expect(inviteColumns(invite.id, "token_hash, expires_at")).toEqual(before);
  });

  it("answers 500 to a preview, an acceptance or a decline of a link it can't hash, and changes nothing", async () => {
    const invite = await createInvite("admin-user", "new@example.test", "viewer");
    tokenHashingFails();
    const refusal = { status: 500, data: { error: "Unable to verify invite token" } };

    expect(await asUser("new-user", "GET", `/invites/${invite.token}`)).toMatchObject(refusal);
    expect(await asUser("new-user", "POST", `/invites/${invite.token}/accept`)).toMatchObject(refusal);
    expect(await asUser("new-user", "POST", `/invites/${invite.token}/decline`)).toMatchObject(refusal);
    expect(newUserMembership()).toEqual([]);
    expect(revocationAndAcceptance(invite.id)).toEqual({ revoked_at: null, accepted_at: null });
  });
});
