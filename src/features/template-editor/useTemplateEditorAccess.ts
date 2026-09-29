import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/contexts/CloudflareAuthContext";
import { useTemplateLists } from "@/contexts/TemplatesContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cloneTemplateEditorFormValues } from "@/features/template-editor/postSaveFormState";
import {
  clearTemplateDraft,
  clearTemplateEditDraft,
  getTemplateDraftKey,
  readTemplateDraft,
  readTemplateEditDraft,
  saveTemplateDraft,
  saveTemplateEditDraft,
  settleTemplateDraftAfterSave,
  type StoredTemplateDraft,
  type TemplateDraftOwner,
} from "@/features/template-editor/templateDraftStore";
import {
  countContextTemplates,
  isTemplateLimitReached,
  resolveTemplateLimitNotice,
  resolveTemplateSaveFailureNotice,
  shouldLoadTemplateCountForLimit,
  type TemplateEditorAccessNotice,
} from "@/features/template-editor/templateEditorAccess";
import { useOtherContextTemplateDraft } from "@/features/template-editor/useOtherContextTemplateDraft";
import { useIsClient } from "@/hooks/useIsClient";
import { usePageRestoredFromCache, useRedirectPending } from "@/hooks/useRedirectPending";
import type { SaveTemplateResult } from "@/hooks/useTemplateSave";
import { navigateToLoginWithReturnPath, startBillingCheckout } from "@/lib/access-flow";
import { api } from "@/lib/api";
import { BILLING_STATUS_QUERY_PREFIX, getBillingStatusQueryKey } from "@/lib/billing";
import { useAppRouter } from "@/lib/navigation/useAppRouter";
import type { TemplateEditorFormValues } from "@/lib/forms/templateEditorForm";

type TemplateEditorAccessOptions = {
  // The new-template route: the only one with a limit to hit.
  isCreate: boolean;
  // The existing template being edited.
  templateId?: string;
  getValues: () => TemplateEditorFormValues;
  // The version the form's edits are made on (see useTemplateEditorModel).
  getVersion?: () => number | undefined;
  allowLeave: () => void;
  guardLeave: () => void;
};

// The plan and the session can stop a template from saving. This offers the way
// forward (Personal checkout, the paid-Organization note, sign-in), and keeps the
// draft on this tab while the user upgrades or signs in, or when the session ends in
// the background, so the editor can restore it afterwards.
export const useTemplateEditorAccess = ({
  isCreate,
  templateId,
  getValues,
  getVersion,
  allowLeave,
  guardLeave,
}: TemplateEditorAccessOptions) => {
  const { user } = useAuth();
  const { activeTeamId, isTeamWorkspace } = useWorkspace();
  const router = useAppRouter();
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
  // The key of a new template's draft offered when the editor opened and not yet
  // restored or discarded. That slot is the kept draft's, not this form's: a different
  // template saved, refused, or kept from here neither clears nor replaces it. A ref,
  // so a save that finishes after the user left reads the latest answer.
  const offeredDraftKey = useRef<string | null>(null);
  // Set until the browser leaves for checkout; Back from Stripe clears it (the leave
  // guard re-arms itself on the same restore).
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const userId = user?.id;
  const owner = userId ? { userId, teamId: activeTeamId } : null;
  const editOwner = userId && templateId && !isCreate ? { userId, templateId } : null;
  const context = {
    isOrganization: isTeamWorkspace,
    billingEnabled: billing.data?.billingEnabled ?? true,
  };

  // Offer a kept draft when the editor opens: a new template's for this context, or the
  // user's own edits to this template. Drafts are in this browser's storage, so the server's
  // render and hydration offer none; the editor opens again for another template, context
  // or user.
  const isClient = useIsClient();
  const opening = isClient ? `${isCreate}:${templateId ?? ""}:${userId ?? ""}:${activeTeamId ?? ""}` : null;
  const [opened, setOpened] = useState<{ opening: string; offeredDraftKey: string | null } | null>(null);
  if (opening !== null && opened?.opening !== opening) {
    let kept: StoredTemplateDraft | null = null;
    let offeredKey: string | null = null;
    if (userId && isCreate) {
      kept = readTemplateDraft({ userId, teamId: activeTeamId });
      offeredKey = kept ? getTemplateDraftKey({ userId, teamId: activeTeamId }) : null;
    } else if (userId && templateId) {
      kept = readTemplateEditDraft({ userId, templateId });
    }
    setOpened({ opening, offeredDraftKey: offeredKey });
    setDraft(kept);
    setSaveNotice(null);
  }
  // Restore and Discard release the slot until the editor opens again.
  useEffect(() => {
    offeredDraftKey.current = opened?.offeredDraftKey ?? null;
  }, [opened]);
  // A new template's draft kept in another context, offered with a switch to it.
  const otherContext = useOtherContextTemplateDraft({ enabled: isCreate && !draft, userId });

  const limitReached =
    isCreate &&
    Boolean(owner) &&
    isTemplateLimitReached({
      maxTemplates: billing.data?.limits?.maxTemplates,
      ownedCount:
        owner && !templatesLoading ? countContextTemplates(allTemplates, owner) : undefined,
    });

  // False while an offered draft holds the slot (see offeredDraftKey).
  const ownsDraftSlot = (draftOwner: TemplateDraftOwner): boolean =>
    offeredDraftKey.current !== getTemplateDraftKey(draftOwner);

  // True when the draft is stored, so leaving the page loses nothing. Also runs when the
  // session ends in the background, while this render still holds the user who typed it.
  // An offered draft is not replaced: the leave guard stays up and asks instead.
  const keepDraft = (): boolean => {
    if (isCreate && owner) {
      return (
        ownsDraftSlot(owner) &&
        saveTemplateDraft(owner, cloneTemplateEditorFormValues(getValues()))
      );
    }
    return editOwner
      ? saveTemplateEditDraft(editOwner, {
          values: cloneTemplateEditorFormValues(getValues()),
          baseVersion: getVersion?.(),
        })
      : false;
  };

  // The stored draft after a save finishes. The page runs this even when the user left
  // while it saved, so a saved create never leaves a draft to restore (and save twice).
  // A plan gate or ended session keeps the values sent, so a draft survives however the
  // user leaves to upgrade or sign in (a new template is locked while it saves).
  const settleDraft = (result: SaveTemplateResult, submitted: TemplateEditorFormValues): void => {
    // Saved edits replace any kept ones, which were made on an older version.
    if (editOwner && result.success) {
      clearTemplateEditDraft(editOwner);
      setDraft(null);
    }
    // An offered draft that was not restored belongs to another template.
    if (!isCreate || !owner || !ownsDraftSlot(owner)) {
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
    navigateToLoginWithReturnPath(router.push);
  };

  // The draft stays stored until a save succeeds: the plan can still read Free for a
  // moment after checkout, and that save would need the draft again.
  const restoreDraft = (): StoredTemplateDraft | null => {
    const restored = draft ? { ...draft, values: cloneTemplateEditorFormValues(draft.values) } : null;
    if (restored) {
      // The form now holds the draft, so a successful save clears it.
      offeredDraftKey.current = null;
    }
    setDraft(null);
    return restored;
  };

  const discardDraft = (): void => {
    if (editOwner) {
      clearTemplateEditDraft(editOwner);
    } else if (owner) {
      clearTemplateDraft(owner);
      offeredDraftKey.current = null;
    }
    setDraft(null);
  };

  return {
    draft,
    discardDraft,
    handleSaveResult,
    isStartingCheckout,
    keepDraft,
    notice: saveNotice ?? resolveTemplateLimitNotice(limitReached, context),
    ...otherContext,
    restoreDraft,
    settleDraft,
    signIn,
    startUpgrade,
  };
};
