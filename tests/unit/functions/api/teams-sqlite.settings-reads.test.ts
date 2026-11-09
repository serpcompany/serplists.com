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

function archiveTheOrganizationJustBeforeItIsRead() {
  d1.setStatementHook((sql) => {
    if (!/^select .* from "teams" where/.test(sql)) return;
    d1.setStatementHook(null);
    d1.run("UPDATE teams SET archived_at = ? WHERE id = 'team-1'", createdAt);
  });
}

describe("Organization settings and activity, against SQLite", () => {
  beforeEach(openTheSeededOrganization);
  afterEach(expectOneActiveOwnerAndClose);

  it.each([
    ["once the Organization is archived", () => d1.run("UPDATE teams SET archived_at = ? WHERE id = 'team-1'", createdAt)],
    ["on an Organization archived after its member was checked", archiveTheOrganizationJustBeforeItIsRead],
  ])("answers 404 to a settings change %s, and keeps its name", async (_when, archive) => {
    archive();

    expect(await asUser("admin-user", "PUT", "/team-1", { name: "Renamed" }))
      .toMatchObject({ status: 404, data: { error: "Organization not found" } });
    expect(d1.rows("SELECT name FROM teams WHERE id = 'team-1'")).toEqual([{ name: "Acme" }]);
  });

  it("answers 404 to a read of an Organization archived after its member was checked", async () => {
    archiveTheOrganizationJustBeforeItIsRead();

    expect(await asUser("member-user", "GET", "/team-1")).toMatchObject({ status: 404, data: { error: "Organization not found" } });
  });

  it("lists activity with metadata that is not JSON as none", async () => {
    addTeamAudit("audit-1", "{not json");
    addTeamAudit("audit-2", null);

    const activity = await listAsUser("admin-user", "/team-1/activity");

    expect(activity.status).toBe(200);
    expect(activity.data.map(({ id, metadata }) => ({ id, metadata }))).toEqual(arrayContaining([
      { id: "audit-1", metadata: null },
      { id: "audit-2", metadata: null },
    ]));
  });

  it("reads an activity limit that is not a number as the default of fifty events", async () => {
    for (let event = 0; event < 60; event += 1) addTeamAudit(`audit-${event}`, null);

    const activity = await listAsUser("admin-user", "/team-1/activity?limit=many");

    expect(activity.status).toBe(200);
    expect(activity.data).toHaveLength(50);
  });

  it("lists only active members to a member who cannot manage the Organization", async () => {
    d1.run("UPDATE team_members SET status = 'disabled' WHERE id = 'member-m'");

    const members = await listAsUser("other-user", "/team-1/members");

    expect(members.data.map(({ id }) => id).sort()).toEqual(["admin-member", "member-x", "owner-member"]);
  });
});
