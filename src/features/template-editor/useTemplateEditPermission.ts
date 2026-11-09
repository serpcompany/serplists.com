import { useState } from "react";

import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  resolveTemplateEditPermission,
  type TemplateEditPermission,
  type TemplateOwnership,
} from "@/features/template-editor/templateEditPermission";

export const useTemplateEditPermission = (params: {
  isCreate: boolean;
  loading: boolean;
  ownership: TemplateOwnership | undefined;
}): TemplateEditPermission => {
  const { user } = useAuth();
  const { canEditTemplates, isWorkspaceLoading, teams } = useWorkspace();
  const [opened, setOpened] = useState(false);

  const ownerUnknownAfterFailedLoad = !params.isCreate && !params.ownership;
  let permission: TemplateEditPermission = "checking";
  if (!params.loading) {
    permission = ownerUnknownAfterFailedLoad
      ? "editable"
      : resolveTemplateEditPermission({
          template: params.isCreate ? null : params.ownership ?? null,
          userId: user?.id,
          workspaceLoading: isWorkspaceLoading,
          roleIn: (teamId) => teams.find((team) => team.id === teamId)?.role,
          canCreateHere: canEditTemplates,
        });
  }

  if (permission === "editable" && !opened) {
    setOpened(true);
  }

  return opened ? "editable" : permission;
};
