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
  // The context's name: the Organization's, or "Personal".
  name: string;
  draft: StoredTemplateDraft;
};

// A new template's draft kept in a context other than the active one (a confirmed sign-out
// returns the tab to Personal; see findOtherContextDraft). It is offered with a switch to
// its context, where the editor then offers the draft itself: it is never restored into,
// and saved to, a context other than the one it was written for.
export const useOtherContextTemplateDraft = ({
  enabled,
  userId,
}: {
  // The new-template editor, with no draft of the active context to offer.
  enabled: boolean;
  userId?: string;
}) => {
  const { activeTeamId, getPermissions, isWorkspaceLoading, selectWorkspace, teams } = useWorkspace();
  // Drafts are in this browser's storage: the server's render and hydration have none.
  const isClient = useIsClient();
  // Looked up again whenever the context, its Organizations or the user change.
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
  // Discard hides the offer until the next lookup.
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
