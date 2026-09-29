import { getOrganizationPermissions, type OrganizationRole } from "@/lib/organizationPermissions";
import type { ChecklistTemplate } from "@/types/checklist";

export type TemplateOwnership = Pick<ChecklistTemplate, "userId" | "teamId" | "ownerType">;

// "checking" until the viewer's Organizations have loaded. The two refusals name why:
// the viewer's Organization role, or a template someone else owns.
export type TemplateEditPermission = "checking" | "editable" | "organization_role" | "not_owner";

/**
 * Whether the editor may open its form. Mirrors the API's rule (canEditTemplate in
 * functions/api/handlers/templates.ts), which stays the authority: an Organization's
 * Template follows the viewer's role in that Organization, whichever context is active,
 * never who created it; a Personal Template belongs to its owner. The new-template route
 * creates in the active context, so that context's role decides.
 */
export const resolveTemplateEditPermission = (params: {
  // The loaded template's owner; null on the new-template route.
  template: TemplateOwnership | null;
  userId: string | undefined;
  workspaceLoading: boolean;
  // The viewer's role in an Organization, when their Organization list has it.
  roleIn: (teamId: string) => OrganizationRole | undefined;
  // The active context allows creating Templates (always true in Personal).
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
    // The API sends team_id only to a member, so a missing role means the Organization
    // list is behind (or failed to load): leave the decision to the save.
    if (!role) {
      return "editable";
    }
    return getOrganizationPermissions(role).canEditTemplates ? "editable" : "organization_role";
  }

  // An Organization's public Template seen from outside the Organization carries no
  // team_id. Its Creator is no longer a member, so they cannot edit it either.
  if (template.ownerType === "team") {
    return "not_owner";
  }

  return params.userId && template.userId === params.userId ? "editable" : "not_owner";
};
