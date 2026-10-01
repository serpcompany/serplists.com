import { describe, expect, it } from "vitest";

import { resolveTemplateEditPermission } from "@/features/template-editor/templateEditPermission";
import type { OrganizationRole } from "@/lib/organizationPermissions";

const resolve = (
  overrides: Partial<Parameters<typeof resolveTemplateEditPermission>[0]> = {},
  roles: Record<string, OrganizationRole> = {},
) =>
  resolveTemplateEditPermission({
    template: { userId: "user-1", ownerType: "user" },
    userId: "user-1",
    workspaceLoading: false,
    roleIn: (teamId) => roles[teamId],
    canCreateHere: true,
    ...overrides,
  });

const organizationTemplate = { userId: "creator-1", teamId: "team-1", ownerType: "team" as const };

describe("resolveTemplateEditPermission, which follows the API's canEditTemplate: an Organization's Template by the viewer's role there, a Personal one by its owner", () => {
  it("lets the owner edit a Personal Template", () => {
    expect(resolve()).toBe("editable");
  });

  it("refuses another user's public Personal Template", () => {
    expect(resolve({ template: { userId: "someone-else", ownerType: "user" } })).toBe("not_owner");
  });

  it.each(["owner", "admin", "editor"] as const)(
    "lets an Organization %s edit its Template from any context",
    (role) => {
      expect(resolve({ template: organizationTemplate }, { "team-1": role })).toBe("editable");
    },
  );

  it.each(["runner", "viewer"] as const)("refuses an Organization %s", (role) => {
    expect(resolve({ template: organizationTemplate }, { "team-1": role })).toBe("organization_role");
  });

  it("refuses a demoted Creator: the role decides, not who created it", () => {
    const template = { ...organizationTemplate, userId: "user-1" };
    expect(resolve({ template }, { "team-1": "viewer" })).toBe("organization_role");
  });

  it("refuses an Organization's public Template seen from outside it, even by its Creator, which the API sends to non-members without team_id", () => {
    const template = { userId: "user-1", ownerType: "team" as const };
    expect(resolve({ template })).toBe("not_owner");
  });

  it("leaves the decision to the save when the API sent team_id, so the viewer is a member, but the Organization list does not have the role yet", () => {
    expect(resolve({ template: organizationTemplate })).toBe("editable");
  });

  it("waits for the Organization list before deciding", () => {
    expect(resolve({ template: organizationTemplate, workspaceLoading: true }, { "team-1": "viewer" })).toBe(
      "checking",
    );
    expect(resolve({ template: null, workspaceLoading: true })).toBe("checking");
  });

  it("lets the new-template route create only where the active context allows it", () => {
    expect(resolve({ template: null })).toBe("editable");
    expect(resolve({ template: null, canCreateHere: false })).toBe("organization_role");
  });
});
