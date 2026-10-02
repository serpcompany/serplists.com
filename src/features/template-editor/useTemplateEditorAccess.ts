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
  isCreate: boolean;
  templateId?: string;
  getValues: () => TemplateEditorFormValues;
  getVersion?: () => number | undefined;
  allowLeave: () => void;
  guardLeave: () => void;
};

const findKeptDraftToOffer = ({
  isCreate,
  templateId,
  userId,
  activeTeamId,
}: {
  isCreate: boolean;
  templateId?: string;
  userId?: string;
  activeTeamId?: string;
}): { draft: StoredTemplateDraft | null; offeredDraftKey: string | null } => {
  if (userId && isCreate) {
    const owner = { userId, teamId: activeTeamId };
    const draft = readTemplateDraft(owner);
    return { draft, offeredDraftKey: draft ? getTemplateDraftKey(owner) : null };
  }
  if (userId && templateId) {
    return { draft: readTemplateEditDraft({ userId, templateId }), offeredDraftKey: null };
  }
  return { draft: null, offeredDraftKey: null };
};

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
  usePageRestoredFromCache(useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_QUERY_PREFIX });
  }, [queryClient]));
  const { allTemplates, templatesLoading } = useTemplateLists({
    workspace: shouldLoadTemplateCountForLimit({
      isCreate,
      maxTemplates: billing.data?.limits?.maxTemplates,
    }),
  });
  const [saveNotice, setSaveNotice] = useState<TemplateEditorAccessNotice | null>(null);
  const [draft, setDraft] = useState<StoredTemplateDraft | null>(null);
  const offeredDraftKey = useRef<string | null>(null);
  const [isStartingCheckout, setIsStartingCheckout] = useRedirectPending();
  const userId = user?.id;
  const owner = userId ? { userId, teamId: activeTeamId } : null;
  const editOwner = userId && templateId && !isCreate ? { userId, templateId } : null;
  const context = {
    isOrganization: isTeamWorkspace,
    billingEnabled: billing.data?.billingEnabled ?? true,
  };

  const isClient = useIsClient();
  const openingKey = isClient ? `${isCreate}:${templateId ?? ""}:${userId ?? ""}:${activeTeamId ?? ""}` : null;
  const [opened, setOpened] = useState<{ openingKey: string; offeredDraftKey: string | null } | null>(null);
  if (openingKey !== null && opened?.openingKey !== openingKey) {
    const offered = findKeptDraftToOffer({ isCreate, templateId, userId, activeTeamId });
    setOpened({ openingKey, offeredDraftKey: offered.offeredDraftKey });
    setDraft(offered.draft);
    setSaveNotice(null);
  }
  useEffect(() => {
    offeredDraftKey.current = opened?.offeredDraftKey ?? null;
  }, [opened]);
  const otherContext = useOtherContextTemplateDraft({ enabled: isCreate && !draft, userId });

  const limitReached =
    isCreate &&
    Boolean(owner) &&
    isTemplateLimitReached({
      maxTemplates: billing.data?.limits?.maxTemplates,
      ownedCount:
        owner && !templatesLoading ? countContextTemplates(allTemplates, owner) : undefined,
    });

  const ownsDraftSlot = (draftOwner: TemplateDraftOwner): boolean =>
    offeredDraftKey.current !== getTemplateDraftKey(draftOwner);

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

  const settleDraft = (result: SaveTemplateResult, submitted: TemplateEditorFormValues): void => {
    if (editOwner && result.success) {
      clearTemplateEditDraft(editOwner);
      setDraft(null);
    }
    if (!isCreate || !owner || !ownsDraftSlot(owner)) {
      return;
    }

    settleTemplateDraftAfterSave(owner, {
      saved: result.success,
      keepDraft: Boolean(resolveTemplateSaveFailureNotice(result.failure, context)),
      values: submitted,
    });
  };

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

  const restoreDraft = (): StoredTemplateDraft | null => {
    const restored = draft ? { ...draft, values: cloneTemplateEditorFormValues(draft.values) } : null;
    if (restored) {
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
