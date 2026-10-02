import { getOrganizationPermissions, type OrganizationRole } from "@/lib/organizationPermissions";
import type { ChecklistTemplate } from "@/types/checklist";

export type TemplateOwnership = Pick<ChecklistTemplate, "userId" | "teamId" | "ownerType">;

export type TemplateEditPermission = "checking" | "editable" | "organization_role" | "not_owner";

export const resolveTemplateEditPermission = (params: {
  template: TemplateOwnership | null;
  userId: string | undefined;
  workspaceLoading: boolean;
  roleIn: (teamId: string) => OrganizationRole | undefined;
  canCreateHere: boolean;
}): TemplateEditPermission => {
  if (params.workspaceLoading) {
    return "checking";
  }

  const { template } = params;
  if (!template) {
    return params.canCreateHere ? "editable" : "organization_role";
  }

  if (template.teamId) {
    const role = params.roleIn(template.teamId);
    if (!role) {
      return "editable";
    }
    return getOrganizationPermissions(role).canEditTemplates ? "editable" : "organization_role";
  }

  if (template.ownerType === "team") {
    return "not_owner";
  }

  return params.userId && template.userId === params.userId ? "editable" : "not_owner";
};
