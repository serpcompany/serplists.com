import { beforeEach, describe, expect, it } from "vitest";
import { elementAt, firstOf } from "../../../support/elements";
import { z } from "zod";
import { dbMocks, mockEnv, resetTeamsHandlerMocks } from "../../../support/teamsHandler";
import { handleTeams } from "@functions/api/handlers/teams";
import { readJson } from "../../../support/readJson";
import { objectContaining } from "../../../support/asymmetricMatchers";

const activityBody = z.array(z.object({ actor: z.record(z.unknown()) }).passthrough());

describe("Teams handler", () => {
  beforeEach(resetTeamsHandlerMocks);

  it("lists team activity for team admins", async () => {
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        {
          id: "event-1",
          actor_user_id: "user-1",
          resource_type: "template",
          resource_id: "template-1",
          action: "template.updated",
          metadata_json: '{"field":"title"}',
          request_id: "request-1",
          created_at: "2026-01-01T00:00:00.000Z",
          actorEmail: "admin@example.com",
          actorName: "Admin User",
          actorUsername: "admin",
        },
      ]);
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/activity?limit=10"),
      mockEnv,
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(dbMocks.selectChain.limit).toHaveBeenLastCalledWith(10);
    expect(data).toEqual([
      objectContaining({
        id: "event-1",
        action: "template.updated",
        resource: { type: "template", id: "template-1" },
        metadata: { field: "title" },
        actor: objectContaining({
          email: "admin@example.com",
          name: "Admin User",
        }),
      }),
    ]);
  });

  it("hides share-link editors who are not members of the Organization", async () => {
    const shareEvent = (actor: string) => ({
      id: `event-${actor}`,
      actor_user_id: actor,
      resource_type: "checklist_run",
      resource_id: "run-1",
      action: "checklist_run.shared_updated",
      metadata_json: '{"source":"public_share"}',
      request_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      actorEmail: `${actor}@example.com`,
      actorName: `Name ${actor}`,
      actorUsername: actor,
    });
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([shareEvent("outsider-1"), shareEvent("user-2")])
      .mockResolvedValueOnce([{ user_id: "user-2" }]);
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);

    const response = await handleTeams(new Request("http://localhost/api/teams/team-1/activity"), mockEnv);
    const text = await response.text();
    const data = JSON.parse(text) as Array<{ actor: Record<string, unknown> }>;

    expect(response.status).toBe(200);
    expect(firstOf(data).actor).toEqual({ userId: null, email: null, name: null, username: null });
    expect(text).not.toContain("outsider-1@example.com");
    expect(elementAt(data, 1).actor).toEqual(objectContaining({ userId: "user-2", email: "user-2@example.com" }));
  });

  it("hides a former member only on their share-link events, not on their other activity", async () => {
    const event = (id: string, action: string, metadata: string | null) => ({
      id,
      actor_user_id: "former-1",
      resource_type: action.startsWith("template") ? "template" : "checklist_run",
      resource_id: action.startsWith("template") ? "template-1" : "run-1",
      action,
      metadata_json: metadata,
      request_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
      actorEmail: "former-1@example.com",
      actorName: "Name former-1",
      actorUsername: "former-1",
    });
    dbMocks.selectChain.limit
      .mockResolvedValueOnce([
        { id: "member-1", team_id: "team-1", user_id: "user-1", role: "admin", status: "active" },
      ])
      .mockResolvedValueOnce([
        event("event-share", "checklist_run.shared_updated", '{"source":"public_share"}'),
        event("event-template", "template.updated", '{"field":"title"}'),
        event("event-archive", "checklist_run.archived", null),
      ])
      .mockResolvedValueOnce([]);
    dbMocks.selectChain.orderBy.mockReturnValueOnce(dbMocks.selectChain);

    const response = await handleTeams(new Request("http://localhost/api/teams/team-1/activity"), mockEnv);
    const data = await readJson(response, activityBody);

    expect(response.status).toBe(200);
    expect(firstOf(data).actor).toEqual({ userId: null, email: null, name: null, username: null });
    expect(elementAt(data, 1).actor).toEqual(objectContaining({ userId: "former-1", name: "Name former-1" }));
    expect(elementAt(data, 2).actor).toEqual(objectContaining({ userId: "former-1", name: "Name former-1" }));
  });

  it("rejects team activity listing for non-admin team members", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      { id: "member-1", team_id: "team-1", user_id: "user-1", role: "viewer", status: "active" },
    ]);

    const response = await handleTeams(
      new Request("http://localhost/api/teams/team-1/activity"),
      mockEnv,
    );

    expect(response.status).toBe(403);
    expect(dbMocks.selectChain.orderBy).not.toHaveBeenCalled();
  });
});
