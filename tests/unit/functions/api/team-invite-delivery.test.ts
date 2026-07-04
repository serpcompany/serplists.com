import { describe, expect, it } from "vitest";

import { buildTeamInviteDelivery } from "@functions/api/utils/team-invite-delivery";

describe("team invite delivery", () => {
  it("builds a link invite from the browser origin header", () => {
    const delivery = buildTeamInviteDelivery({
      frontendUrl: "https://configured.serplists.test",
      request: new Request("https://api.serplists.test/api/teams/team-1/invites", {
        headers: {
          Origin: "https://app.serplists.test",
        },
      }),
      token: "invite token",
    });

    expect(delivery).toEqual({
      mode: "link",
      status: "ready",
      invitePath: "/team-invites/invite%20token",
      inviteUrl: "https://app.serplists.test/team-invites/invite%20token",
    });
  });

  it("falls back to the configured frontend URL when there is no origin header", () => {
    const delivery = buildTeamInviteDelivery({
      frontendUrl: "https://serplists.com/dashboard",
      request: new Request("https://api.serplists.test/api/teams/team-1/invites"),
      token: "abc123",
    });

    expect(delivery.inviteUrl).toBe("https://serplists.com/team-invites/abc123");
  });
});
