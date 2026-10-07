import { beforeEach, describe, expect, it } from "vitest";
import { firstOf } from "../../../support/elements";
import { z } from "zod";
import { auditMocks, dbMocks, mockEnv, resetTeamsHandlerMocks, teamMember } from "../../../support/teamsHandler";
import { handleTeams } from "@functions/api/handlers/teams";
import { apiErrorBody, readJson } from "../../../support/readJson";
import { anyInstanceOf, objectContaining } from "../../../support/asymmetricMatchers";

const updatedTeamBody = z.object({ team: z.record(z.unknown()) }).passthrough();

const storedTeam = () => ({
  id: "team-1",
  name: "Old Team",
  slug: "old-team",
  billing_owner_user_id: "user-1",
  created_by_user_id: "user-1",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: null,
  archived_at: null,
});

const updateTheTeam = (body: Record<string, unknown>) =>
  handleTeams(new Request("http://localhost/api/teams/team-1", { method: "PUT", body: JSON.stringify(body) }), mockEnv);

function expectNothingUpdatedOrAudited() {
  expect(dbMocks.updateChain.set).not.toHaveBeenCalled();
  expect(auditMocks.buildAuditEventValues).not.toHaveBeenCalled();
}

describe("Teams handler", () => {
  beforeEach(resetTeamsHandlerMocks);

  it("updates team profile fields for team admins and records audit history", async () => {
    const team = storedTeam();
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([team])
      .mockResolvedValueOnce([]);

    const response = await updateTheTeam({ name: "New Team", slug: "new-team" });
    const data = await readJson(response, updatedTeamBody);

    expect(response.status).toBe(200);
    expect(data.team).toEqual(objectContaining({ name: "New Team", slug: "new-team" }));
    expect(dbMocks.updateChain.set).toHaveBeenCalledWith(
      objectContaining({
        name: "New Team",
        slug: "new-team",
        updated_at: anyInstanceOf(String),
      }),
    );
    expect(auditMocks.buildAuditEventValues).toHaveBeenCalledWith(
      objectContaining({
        action: "team.updated",
        before: team,
        diff: objectContaining({ name: "New Team", slug: "new-team" }),
      }),
    );
  });

  it("rejects team slug updates that collide with another team", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([storedTeam()])
      .mockResolvedValueOnce([{ id: "team-2" }]);

    const response = await updateTheTeam({ slug: "taken-team" });
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(409);
    expect(data.code).toBe("team_slug_exists");
    expectNothingUpdatedOrAudited();
  });

  it.each([
    [{ name: "Old Team", slug: "old-team" }],
    [{ name: "  Old Team  " }],
    [{ slug: "old-team" }],
  ])("treats saving %o over identical Organization settings as a no-op success", async (body) => {
    const team = storedTeam();
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([team]);

    const response = await updateTheTeam(body);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      success: true,
      team: { ...team, membership: { id: "member-1", role: "admin", status: "active" } },
    });
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
    expectNothingUpdatedOrAudited();
  });

  it("still rejects an Organization update that names no fields", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("admin")]);

    const response = await updateTheTeam({});

    expect(response.status).toBe(400);
    expect(dbMocks.db.batch).not.toHaveBeenCalled();
  });

  it("rejects team profile updates for non-admin team members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([teamMember("editor")]);

    const response = await updateTheTeam({ name: "New Team" });

    expect(response.status).toBe(403);
    expectNothingUpdatedOrAudited();
  });

  it("renames an Organization whose stored slug predates the slug bounds, checking the slug only when the settings form changes it", async () => {
    const storedSlug = `${"a".repeat(120)}-abcd1234`;
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([teamMember("admin")])
      .mockResolvedValueOnce([{ id: "team-1", name: "Old Team", slug: storedSlug, archived_at: null }]);

    const response = await updateTheTeam({ name: "New Team", slug: storedSlug });

    expect(response.status).toBe(200);
    expect(firstOf(dbMocks.updateChain.set.mock.calls)[0]).toEqual(objectContaining({ name: "New Team" }));
    expect(firstOf(dbMocks.updateChain.set.mock.calls)[0]).not.toHaveProperty("slug");
  });
});
