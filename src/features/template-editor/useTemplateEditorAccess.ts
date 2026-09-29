import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cloneTemplateEditorFormValues } from "@/features/template-editor/postSaveFormState";
import {
  clearTemplateDraft,
  readTemplateDraft,
  saveTemplateDraft,
  settleTemplateDraftAfterSave,
  type StoredTemplateDraft,
} from "@/features/template-editor/templateDraftStore";
import {
  countContextTemplates,
  isTemplateLimitReached,
  resolveTemplateLimitNotice,
  resolveTemplateSaveFailureNotice,
  shouldLoadTemplateCountForLimit,
  type TemplateEditorAccessNotice,
} from "@/features/template-editor/templateEditorAccess";
import { usePageRestoredFromCache, useRedirectPending } from "@/hooks/useRedirectPending";
import type { SaveTemplateResult } from "@/hooks/useTemplateSave";
import { navigateToLoginWithReturnPath, startBillingCheckout } from "@/lib/access-flow";
import { api } from "@/lib/api";
import { BILLING_STATUS_QUERY_PREFIX, getBillingStatusQueryKey } from "@/lib/billing";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

type TemplateEditorAccessOptions = {
  // The new-template route: the only one with a draft to keep, and a limit to hit.
  isCreate: boolean;
  getValues: () => TemplateEditorFormValues;
  allowLeave: () => void;
  guardLeave: () => void;
};

// The plan and the session can stop a template from saving. This offers the way
// forward (Personal checkout, the paid-Organization note, sign-in), and keeps a new
// template's draft on this tab while the user upgrades or signs in, so the
// new-template editor can restore it afterwards.
export const useTemplateEditorAccess = ({
  isCreate,
  getValues,
  allowLeave,
  guardLeave,
}: TemplateEditorAccessOptions) => {
  const { user } = useAuth();
  const { activeTeamId, isTeamWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(user?.id, activeTeamId),
    queryFn: () => api.getBillingStatus(activeTeamId ? { teamId: activeTeamId } : undefined),
    enabled: Boolean(user) && isCreate,
    retry: false,
  });
  const queryClient = useQueryClient();
  // The plan may have changed at Stripe (or in another tab) before the user pressed Back.
  usePageRestoredFromCache(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  }, [queryClient]));
  // The editor loads its template by id; the workspace list is read only for the count.
  const { allTemplates, templatesLoading } = useTemplateLists({
    workspace: shouldLoadTemplateCountForLimit({
      isCreate,
      maxTemplates: billing.data?.limits?.maxTemplates,
    }),
  });
  const [saveNotice, setSaveNotice] = useState<TemplateEditorAccessNotice | null>(null);
  const [draft, setDraft] = useState<StoredTemplateDraft | null>(null);
  // Set until the browser leaves for checkout; Back from Stripe clears it (the leave
  // guard re-arms itself on the same restore).
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const userId = user?.id;
  const owner = userId ? { userId, teamId: activeTeamId } : null;
  const context = {
    isOrganization: isTeamWorkspace,
    billingEnabled: billing.data?.billingEnabled ?? true,
  };

  // Offer a kept draft only when this editor opens for a new template.
  useEffect(() => {
    setDraft(isCreate && userId ? readTemplateDraft({ userId, teamId: activeTeamId }) : null);
    setSaveNotice(null);
  }, [isCreate, userId, activeTeamId]);

  const limitReached =
    isCreate &&
    Boolean(owner) &&
    isTemplateLimitReached({
      maxTemplates: billing.data?.limits?.maxTemplates,
      ownedCount:
        owner && !templatesLoading ? countContextTemplates(allTemplates, owner) : undefined,
    });

  // True when the draft is stored, so leaving the page loses nothing.
  const keepDraft = (): boolean =>
    isCreate && owner
      ? saveTemplateDraft(owner, cloneTemplateEditorFormValues(getValues()))
      : false;

  // The stored draft after a save finishes. The page runs this even when the user left
  // while it saved, so a saved create never leaves a draft to restore (and save twice).
  // A plan gate or ended session keeps the values sent, so a draft survives however the
  // user leaves to upgrade or sign in (a new template is locked while it saves).
  const settleDraft = (result: SaveTemplateResult, submitted: TemplateEditorFormValues): void => {
    if (!isCreate || !owner) {
      return;
    }

    settleTemplateDraftAfterSave(owner, {
      saved: result.success,
      keepDraft: Boolean(resolveTemplateSaveFailureNotice(result.failure, context)),
      values: submitted,
    });
  };

  // The notice for a finished save, while the user is still on the page. Returns true
  // when the failure is shown as a notice instead of the error list.
  const handleSaveResult = (result: SaveTemplateResult): boolean => {
    const notice = result.success
      ? null
      : resolveTemplateSaveFailureNotice(result.failure, context);
    setSaveNotice(notice);
    return Boolean(notice);
  };

  const startUpgrade = async (): Promise<void> => {
    setIsStartingCheckout(true);
    if (keepDraft()) {
      allowLeave();
    }
    const started = await startBillingCheckout(context.billingEnabled);
    if (!started) {
      guardLeave();
      setIsStartingCheckout(false);
    }
  };

  const signIn = (): void => {
    if (keepDraft()) {
      allowLeave();
    }
    navigateToLoginWithReturnPath(navigate, location);
  };

  // The draft stays stored until a save succeeds: the plan can still read Free for a
  // moment after checkout, and that save would need the draft again.
  const restoreDraft = (): TemplateEditorFormValues | null => {
    const values = draft ? cloneTemplateEditorFormValues(draft.values) : null;
    setDraft(null);
    return values;
  };

  const discardDraft = (): void => {
    if (owner) {
      clearTemplateDraft(owner);
    }
    setDraft(null);
  };

  return {
    draft,
    discardDraft,
    handleSaveResult,
    isStartingCheckout,
    notice: saveNotice ?? resolveTemplateLimitNotice(limitReached, context),
    restoreDraft,
    settleDraft,
    signIn,
    startUpgrade,
  };
};
