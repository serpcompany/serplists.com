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
import { getOrganizationPermissions } from "@/lib/organizationPermissions";

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
  userId: string | undefined;
}) => {
  const { activeTeamId, isWorkspaceLoading, selectWorkspace, teams } = useWorkspace();
  const isClient = useIsClient();
  const lookedUp = useMemo((): OtherContextTemplateDraft | null => {
    if (!isClient || !enabled || !userId) return null;
    const draftsTheyCanContinue = listTemplateDraftContexts(userId).flatMap((context) => {
      if (!context.teamId) return [{ ...context, name: "Personal" }];
      const team = teams.find((candidate) => candidate.id === context.teamId);
      return team && getOrganizationPermissions(team.role).canEditTemplates ? [{ ...context, name: team.name }] : [];
    });
    return findOtherContextDraft(draftsTheyCanContinue, {
      activeTeamId,
      workspaceReady: !isWorkspaceLoading,
    });
  }, [activeTeamId, enabled, isClient, isWorkspaceLoading, teams, userId]);
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
