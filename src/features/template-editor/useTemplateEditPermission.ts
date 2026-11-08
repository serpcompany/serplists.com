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

  const template = params.isCreate ? null : params.ownership;
  let permission: TemplateEditPermission = "checking";
  if (!params.loading) {
    permission = template === undefined
      ? "editable"
      : resolveTemplateEditPermission({
          template,
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
