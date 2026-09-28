import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useBillingStatus } from '@/hooks/useBillingStatus';
import { api, type TemplateHistoryResponse } from '@/lib/api';
import {
  buildRepoTemplateCreatePayload,
  isRepoTemplate,
} from '@/lib/repoTemplateCatalog';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

import { shareTemplateToPublic } from './shareTemplate';
import {
  mapActionFailure,
  type TemplateDetailActionResult,
  type TemplateDetailApiClient,
} from './templateDetailApi';
import { countTemplateItems } from './templateDetailMappers';
import { getTemplateHistoryQueryKey } from './templateHistoryTimeline';
import { canCopyTemplate, getTemplateDetailPermissions } from './templatePermissions';
import { setTemplateVisibility } from './templateVisibility';
import { useTemplateDetailRecord } from './useTemplateDetailRecord';

export type { TemplateDetailActionResult } from './templateDetailApi';
export {
  loadTemplateDetailData,
  type LoadTemplateDetailResult,
} from './loadTemplateDetail';

type CreateTemplate = (
  templateData: Omit<
    ChecklistTemplate,
    'id' | 'userId' | 'createdAt' | 'updatedAt' | 'slug'
  >,
) => Promise<ChecklistTemplate>;

type CreateRun = (params: {
  runName?: string;
  template?: ChecklistTemplate;
  templateId: string;
}) => Promise<ChecklistRun | null>;

type PublicTemplateDetailHookOptions = {
  identifier?: string;
  mode: 'public';
  ownerUsername?: string;
};

// The page loads only its own template (by id), never a Template list.
type PrivateTemplateDetailHookOptions = {
  // The viewer's role in the active context allows editing Templates.
  canEditTemplates: boolean;
  identifier?: string;
  mode: 'private';
};

type TemplateDetailCommonOptions = {
  createRun: CreateRun;
  createTemplate: CreateTemplate;
  isAuthenticated: boolean;
  // Required so every page decides the ownership context: undefined is Personal.
  teamId: string | undefined;
  userId?: string;
  username?: string;
};

export type UseTemplateDetailModelOptions = TemplateDetailCommonOptions &
  (PublicTemplateDetailHookOptions | PrivateTemplateDetailHookOptions);

export type TemplateDetailBillingState = {
  billingEnabled: boolean;
  /** The plan check failed and no plan is known; never treat this as Free. */
  isError: boolean;
  isLoading: boolean;
  isPro: boolean;
};

export type TemplateDetailHistoryState = {
  data: TemplateHistoryResponse | null;
  isError: boolean;
  isLoading: boolean;
};

export const startTemplateRun = async (params: {
  createRun: CreateRun;
  isAuthenticated: boolean;
  runName?: string;
  template: ChecklistTemplate | null;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template) {
    return { kind: 'error', message: 'Template not found.' };
  }

  if (!params.isAuthenticated) {
    return { kind: 'login_required' };
  }

  try {
    const run = await params.createRun({
      templateId: params.template.id,
      runName: params.runName,
      template: params.template,
    });

    if (!run?.id) {
      return { kind: 'error', message: 'Failed to start template run' };
    }

    return { kind: 'ok', runId: run.id };
  } catch (error) {
    return mapActionFailure(error, 'Failed to start template run');
  }
};

export const saveTemplateToAccount = async (params: {
  apiClient?: TemplateDetailApiClient;
  billingState: TemplateDetailBillingState;
  createTemplate: CreateTemplate;
  invalidateTemplates?: () => Promise<void> | void;
  isAuthenticated: boolean;
  teamId?: string;
  template: ChecklistTemplate | null;
  userId?: string;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template) {
    return { kind: 'error', message: 'Template not found.' };
  }

  // The API clones only public templates. Checked before the plan so a private
  // template never sends anyone to checkout for a copy that cannot succeed.
  if (!canCopyTemplate(params.template)) {
    return { kind: 'error', message: 'Only public templates can be copied.' };
  }

  if (!params.isAuthenticated || !params.userId) {
    return { kind: 'login_required' };
  }

  // Only Personal copying is a Pro feature. The API enforces an Organization's Template
  // limit (a Free Organization may copy within it) and reports limit_reached, which
  // maps to upgrade_required.
  if (!params.teamId && params.billingState.isLoading) {
    return { kind: 'error', message: 'Checking your plan. Try again in a moment.' };
  }

  // A failed plan check is not the Free plan: ask for a retry instead of checkout.
  if (!params.teamId && params.billingState.isError) {
    return { kind: 'error', message: "Couldn't check your plan. Try again." };
  }

  if (!params.teamId && !params.billingState.isPro) {
    return { kind: 'upgrade_required' };
  }

  const apiClient = params.apiClient ?? api;

  try {
    if (isRepoTemplate(params.template)) {
      const createdTemplate = await params.createTemplate(
        buildRepoTemplateCreatePayload(params.template, params.teamId),
      );
      return { kind: 'ok', templateId: createdTemplate.id };
    }

    const clonedTemplate = await apiClient.clonePublicTemplate(params.template.id, {
      teamId: params.teamId,
      visibility: 'private',
    });

    await params.invalidateTemplates?.();

    return { kind: 'ok', templateId: clonedTemplate.id };
  } catch (error) {
    return mapActionFailure(error, 'Failed to save template');
  }
};

export const useTemplateDetailModel = (
  options: UseTemplateDetailModelOptions,
) => {
  const queryClient = useQueryClient();
  const {
    loadError,
    loading,
    notFound,
    reload,
    template,
    updateTemplate,
  } = useTemplateDetailRecord({
    identifier: options.identifier,
    mode: options.mode,
    ownerUsername: options.mode === 'public' ? options.ownerUsername : undefined,
    userId: options.userId,
  });

  const billing = useBillingStatus({
    enabled: options.isAuthenticated,
    teamId: options.teamId,
    userId: options.userId,
  });

  const billingState: TemplateDetailBillingState = {
    billingEnabled: billing.status === 'known' ? billing.billingEnabled : true,
    isError: billing.status === 'error',
    isLoading: billing.status === 'loading',
    isPro: billing.status === 'known' && billing.isPaid,
  };
  const permissions = getTemplateDetailPermissions({
    activeTeamId: options.teamId,
    canEditTemplates: options.mode === 'private' && options.canEditTemplates,
    template: options.mode === 'private' ? template : null,
    userId: options.userId,
  });
  const canLoadTemplateHistory =
    options.isAuthenticated && permissions.canViewHistory;

  const history = useQuery({
    queryKey: getTemplateHistoryQueryKey(template?.id, options.userId, options.teamId),
    queryFn: () => api.getTemplateHistory(template?.id ?? ''),
    enabled: canLoadTemplateHistory,
    retry: false,
  });

  const invalidateTemplates = async () => {
    if (!options.userId) {
      return;
    }

    // ['templates'] also covers the open template (so the next write sends its current
    // version), the public catalog, which Share changes, and the Changelog.
    await queryClient.invalidateQueries({ queryKey: ['templates'] });
  };

  const startRun = async (runName?: string): Promise<TemplateDetailActionResult> =>
    startTemplateRun({
      createRun: options.createRun,
      isAuthenticated: options.isAuthenticated,
      runName,
      template,
    });

  const saveTemplate = async (): Promise<TemplateDetailActionResult> => {
    if (billing.status === 'error') {
      // Check again so the next attempt can go through.
      billing.refetch();
    }

    return saveTemplateToAccount({
      billingState,
      createTemplate: options.createTemplate,
      invalidateTemplates,
      isAuthenticated: options.isAuthenticated,
      teamId: options.teamId,
      template,
      userId: options.userId,
    });
  };

  // `template` is the only source of visibility; both actions keep it in step with the server.
  const shareTemplate = async (): Promise<TemplateDetailActionResult> =>
    shareTemplateToPublic({
      canShare: permissions.canShare,
      invalidateTemplates,
      isAuthenticated: options.isAuthenticated,
      // Ignore the result if the page moved to another template during the request.
      onTemplateChange: (shared) =>
        updateTemplate((current) => (current?.id === shared.id ? shared : current)),
      origin: window.location.origin,
      template,
      userId: options.userId,
      username: options.username,
    });

  const setVisibility = async (
    isPublic: boolean,
  ): Promise<TemplateDetailActionResult> =>
    setTemplateVisibility({
      canEdit: permissions.canEdit,
      invalidateTemplates,
      isPublic,
      onTemplateChange: updateTemplate,
      template,
    });

  return {
    billingState,
    // Checks the plan again after a failed check, so the next attempt can go through.
    refetchBilling: billing.refetch,
    history: {
      data: history.data ?? null,
      isError: history.isError,
      isLoading: canLoadTemplateHistory && history.isLoading,
    } satisfies TemplateDetailHistoryState,
    loadError,
    loading,
    notFound,
    permissions,
    reload,
    saveTemplate,
    setVisibility,
    shareTemplate,
    startRun,
    template,
    totalItems: template ? countTemplateItems(template) : 0,
  };
};
