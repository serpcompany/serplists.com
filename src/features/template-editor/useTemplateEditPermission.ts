import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  resolveTemplateEditPermission,
  type TemplateEditPermission,
  type TemplateOwnership,
} from "@/features/template-editor/templateEditPermission";

/**
 * Whether the editor opens its form, once the template and the viewer's Organizations
 * have loaded. An open form stays open: a later change (a teams refetch, a context switch
 * on the new-template route) never takes unsaved edits off the page, and the save stays
 * the authority. The editor remounts for each template (TemplateEditorRoute).
 */
export const useTemplateEditPermission = (params: {
  isCreate: boolean;
  loading: boolean;
  ownership: TemplateOwnership | undefined;
}): TemplateEditPermission => {
  const { user } = useAuth();
  const { canEditTemplates, isWorkspaceLoading, teams } = useWorkspace();
  const [opened, setOpened] = useState(false);

  let permission: TemplateEditPermission = "checking";
  if (!params.loading) {
    permission =
      !params.isCreate && !params.ownership
        ? // Nothing to check against (a failed load shows its own error): the save decides.
          "editable"
        : resolveTemplateEditPermission({
            template: params.isCreate ? null : params.ownership ?? null,
            userId: user?.id,
            workspaceLoading: isWorkspaceLoading,
            roleIn: (teamId) => teams.find((team) => team.id === teamId)?.role,
            canCreateHere: canEditTemplates,
          });
  }

  useEffect(() => {
    if (permission === "editable") {
      setOpened(true);
    }
  }, [permission]);

  return opened ? "editable" : permission;
};
