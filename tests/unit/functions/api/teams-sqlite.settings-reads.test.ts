import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asUser, createdAt, d1, expectOneActiveOwnerAndClose, listAsUser, openTheSeededOrganization } from "../../../support/teamsSqlite";
import { arrayContaining } from "../../../support/asymmetricMatchers";

function addTeamAudit(id: string, metadataJson: string | null) {
  d1.run(
    `INSERT INTO audit_events (id, actor_user_id, subject_type, subject_id, resource_type, resource_id, action, metadata_json, created_at)
     VALUES (?, 'owner-user', 'team', 'team-1', 'team', 'team-1', 'team.updated', ?, ?)`,
    id, metadataJson, createdAt,
  );
}

describe("Organization settings and activity, against SQLite", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  it("answers 404 to a settings change once the Organization is archived, and keeps its name", async () => {
    d1.run("UPDATE teams SET archived_at = ? WHERE id = 'team-1'", createdAt);

    expect(await asUser("admin-user", "PUT", "/team-1", { name: "Renamed" }))
      .toMatchObject({ status: 404, data: { error: "Organization not found" } });
    expect(d1.rows("SELECT name FROM teams WHERE id = 'team-1'")).toEqual([{ name: "Acme" }]);
  });

  it("lists activity with metadata that is not JSON as none, and reads a limit that is not a number as the default", async () => {
    addTeamAudit("audit-1", "{not json");
    addTeamAudit("audit-2", null);

    const activity = await listAsUser("admin-user", "/team-1/activity?limit=many");

    expect(activity.status).toBe(200);
    expect(activity.data.map(({ id, metadata }) => ({ id, metadata }))).toEqual(arrayContaining([
      { id: "audit-1", metadata: null },
      { id: "audit-2", metadata: null },
    ]));
  });

  it("lists only active members to a member who cannot manage the Organization", async () => {
    d1.run("UPDATE team_members SET status = 'disabled' WHERE id = 'member-m'");

    const members = await listAsUser("other-user", "/team-1/members");

    expect(members.data.map(({ id }) => id).sort()).toEqual(["admin-member", "member-x", "owner-member"]);
  });
});
