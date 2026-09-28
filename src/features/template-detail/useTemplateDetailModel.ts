import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useBillingStatus } from '@/hooks/useBillingStatus';
import { api, type TemplateHistoryResponse } from '@/lib/api';

import { shareTemplateToPublic } from './shareTemplate';
import {
  type CreateRun,
  type CreateTemplate,
  duplicateOwnedTemplate,
  saveTemplateToAccount,
  startTemplateRun,
  type TemplateDetailActionResult,
  type TemplateDetailBillingState,
} from './templateActionOutcome';
import { countTemplateItems } from './templateDetailMappers';
import { getTemplateHistoryQueryKey } from './templateHistoryTimeline';
import { getTemplateDetailPermissions } from './templatePermissions';
import { setTemplateVisibility } from './templateVisibility';
import { useTemplateDetailRecord } from './useTemplateDetailRecord';

export {
  duplicateOwnedTemplate,
  saveTemplateToAccount,
  startTemplateRun,
  type TemplateDetailActionResult,
  type TemplateDetailBillingState,
};
export {
  loadTemplateDetailData,
  type LoadTemplateDetailResult,
} from './loadTemplateDetail';
export { resolveShareOwnerTemplate } from './templateDetailApi';

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

export type TemplateDetailHistoryState = {
  data: TemplateHistoryResponse | null;
  isError: boolean;
  isLoading: boolean;
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

  // ['templates'] also covers the open template (so the next write sends its current
  // version), the public catalog, which Share changes, and the Changelog. After a 409 edit
  // conflict it reloads the stored template in place, without the loading state.
  const invalidateTemplates = async () => {
    if (!options.userId) {
      return;
    }

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

  const duplicateTemplate = async (): Promise<TemplateDetailActionResult> =>
    template
      ? duplicateOwnedTemplate({
          activeTeamId: options.teamId,
          createTemplate: options.createTemplate,
          template,
        })
      : { kind: 'error', message: 'Template not found.' };

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
      reloadAfterConflict: invalidateTemplates,
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
      reloadAfterConflict: invalidateTemplates,
      template,
    });

  return {
    billingState,
    duplicateTemplate,
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
