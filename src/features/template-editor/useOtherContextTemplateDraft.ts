import { useMemo, useState } from "react";

import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PERSONAL_WORKSPACE_ID } from "@/contexts/workspaceSelection";
import {
  clearTemplateDraft,
  listTemplateDraftContexts,
  type StoredTemplateDraft,
} from "@/features/template-editor/templateDraftStore";
import { findOtherContextDraft } from "@/features/template-editor/templateEditorAccess";
import { useIsClient } from "@/hooks/useIsClient";

export type OtherContextTemplateDraft = {
  teamId: string | null;
  name: string;
  draft: StoredTemplateDraft;
};

export const useOtherContextTemplateDraft = ({
  enabled,
  userId,
}: {
  enabled: boolean;
  userId?: string;
}) => {
  const { activeTeamId, getPermissions, isWorkspaceLoading, selectWorkspace, teams } = useWorkspace();
  const isClient = useIsClient();
  const lookedUp = useMemo((): OtherContextTemplateDraft | null => {
    if (!isClient || !enabled || !userId) return null;
    const nameOf = (teamId: string | null): string | undefined =>
      teamId ? teams.find((team) => team.id === teamId)?.name : "Personal";
    const other = findOtherContextDraft(listTemplateDraftContexts(userId), {
      activeTeamId,
      workspaceReady: !isWorkspaceLoading,
      canCreateIn: (teamId) =>
        Boolean(nameOf(teamId)) && (!teamId || getPermissions(teamId).canEditTemplates),
    });
    return other ? { ...other, name: nameOf(other.teamId) ?? "" } : null;
  }, [activeTeamId, enabled, getPermissions, isClient, isWorkspaceLoading, teams, userId]);
  const [discarded, setDiscarded] = useState<OtherContextTemplateDraft | null>(null);
  const found = lookedUp === discarded ? null : lookedUp;

  return {
    otherContextDraft: found,
    switchToDraftContext: (): void => {
      if (found) {
        selectWorkspace(found.teamId ?? PERSONAL_WORKSPACE_ID);
      }
    },
    discardOtherContextDraft: (): void => {
      if (found && userId) {
        clearTemplateDraft({ userId, teamId: found.teamId });
      }
      setDiscarded(lookedUp);
    },
  };
};
