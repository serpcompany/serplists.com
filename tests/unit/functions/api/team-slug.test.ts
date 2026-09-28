import { describe, expect, it } from "vitest";

import { isTeamSlugUniqueViolation, suffixTeamSlug, teamSlugBase } from "@functions/api/utils/team-slug";

describe("Organization slug helpers", () => {
  it("keeps a suffixed slug within the 120 characters the update schema accepts", () => {
    const base = teamSlugBase(`${"a".repeat(110)} ${"b".repeat(9)}`, "12345678-team");
    expect(base).toHaveLength(120);

    const suffixed = suffixTeamSlug(base, "1a2b3c4d");

    expect(suffixed.length).toBeLessThanOrEqual(120);
    expect(suffixed).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(suffixed.endsWith("-1a2b3c4d")).toBe(true);
  });

  it("falls back to team-<id8> for a name with no usable characters", () => {
    expect(teamSlugBase("🚀🚀", "12345678-team")).toBe("team-12345678");
  });

  it.each([
    ["UNIQUE constraint failed: teams.slug", true],
    ["D1_ERROR: UNIQUE constraint failed: teams.slug: SQLITE_CONSTRAINT", true],
    ["D1_ERROR: UNIQUE constraint failed: team_members.team_id, team_members.user_id", false],
    ["D1_ERROR: UNIQUE constraint failed: teams.slug_history", false],
    ["Failed query: insert into \"teams\" (\"slug\") values (?)", false],
  ])("classifies %j as a slug conflict: %s", (message, expected) => {
    expect(isTeamSlugUniqueViolation(new Error(message))).toBe(expected);
    expect(isTeamSlugUniqueViolation(new Error("Failed query", { cause: new Error(message) }))).toBe(expected);
  });

  it("ignores values that are not errors", () => {
    expect(isTeamSlugUniqueViolation("UNIQUE constraint failed: teams.slug")).toBe(false);
    expect(isTeamSlugUniqueViolation(null)).toBe(false);
  });
});
