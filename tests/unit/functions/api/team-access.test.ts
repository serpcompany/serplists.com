import { describe, expect, it } from "vitest";
import {
  canEditTeamTemplates,
  canManageTeam,
  canRunTeamTemplates,
  canViewTeam,
  normalizeTeamRole,
} from "@functions/api/utils/team-access";

describe("team access helpers", () => {
  it("normalizes unknown roles to viewer", () => {
    expect(normalizeTeamRole("owner")).toBe("owner");
    expect(normalizeTeamRole("not-a-role")).toBe("viewer");
    expect(normalizeTeamRole(null, "runner")).toBe("runner");
  });

  it("orders team capabilities by role", () => {
    expect(canViewTeam("viewer")).toBe(true);
    expect(canRunTeamTemplates("runner")).toBe(true);
    expect(canRunTeamTemplates("viewer")).toBe(false);
    expect(canEditTeamTemplates("editor")).toBe(true);
    expect(canEditTeamTemplates("runner")).toBe(false);
    expect(canManageTeam("admin")).toBe(true);
    expect(canManageTeam("editor")).toBe(false);
    expect(canManageTeam("owner")).toBe(true);
  });
});
