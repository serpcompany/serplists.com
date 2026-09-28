import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type TemplateHistoryResponse } from '@/lib/api';
import { getBillingStatusQueryKey } from '@/lib/billing';
import {
  buildRepoTemplateCreatePayload,
  findPublicTemplateByIdentifier,
  isRepoTemplate,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import { resolvePublicTemplateOwnerSlug } from '@/lib/routes';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

import { shareTemplateToPublic } from './shareTemplate';
import {
  hydrateTemplateOwner,
  mapActionFailure,
  type TemplateDetailActionResult,
  type TemplateDetailApiClient,
} from './templateDetailApi';
import {
  countTemplateItems,
  mapApiTemplateToChecklistTemplate,
} from './templateDetailMappers';
import { getTemplateDetailPermissions } from './templatePermissions';
import { setTemplateVisibility } from './templateVisibility';

export type { TemplateDetailActionResult } from './templateDetailApi';

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

// Public pages always read the server copy: an in-memory list can be arbitrarily old.
type PublicTemplateDetailOptions = {
  identifier?: string;
  mode: 'public';
  ownerUsername?: string;
};

type PrivateTemplateDetailOptions = {
  getCachedTemplate: (identifier: string) => ChecklistTemplate | undefined;
  identifier?: string;
  mode: 'private';
};

// Only the active workspace list, which the page refetches after edits; never the catalog.
type PrivateTemplateDetailHookOptions = {
  // The viewer's role in the active context allows editing Templates.
  canEditTemplates: boolean;
  identifier?: string;
  mode: 'private';
  workspaceTemplates: ChecklistTemplate[] | undefined;
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
  (PublicTemplateDetailOptions | PrivateTemplateDetailHookOptions);

export type TemplateDetailBillingState = {
  billingEnabled: boolean;
  isLoading: boolean;
  isPro: boolean;
};

export type TemplateDetailHistoryState = {
  data: TemplateHistoryResponse | null;
  isError: boolean;
  isLoading: boolean;
};

type LoadTemplateDetailResult = {
  notFound: boolean;
  template: ChecklistTemplate | null;
};

type TemplateDetailDependencies = {
  apiClient?: TemplateDetailApiClient;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuidLike = (value: string): boolean => UUID_PATTERN.test(value);

const getApiClient = (
  dependencies?: TemplateDetailDependencies,
): TemplateDetailApiClient => dependencies?.apiClient ?? api;

export const loadTemplateDetailData = async (
  options: PublicTemplateDetailOptions | PrivateTemplateDetailOptions,
  dependencies?: TemplateDetailDependencies,
): Promise<LoadTemplateDetailResult> => {
  const apiClient = getApiClient(dependencies);

  if (!options.identifier) {
    return { template: null, notFound: true };
  }

  if (options.mode === 'public') {
    if (!options.ownerUsername) {
      return { template: null, notFound: true };
    }

    // Library templates ship in the bundle (the API cannot serve them) and win on a slug clash.
    const libraryTemplate = findPublicTemplateByIdentifier(
      repoTemplates,
      options.identifier,
    );
    if (
      libraryTemplate &&
      resolvePublicTemplateOwnerSlug(libraryTemplate)?.toLowerCase() ===
        options.ownerUsername.toLowerCase()
    ) {
      return { template: libraryTemplate, notFound: false };
    }

    try {
      const rawTemplate = isUuidLike(options.identifier)
        ? await apiClient.getTemplateById(options.identifier)
        : await apiClient.getTemplateBySlug(options.identifier);
      const mappedTemplate = await hydrateTemplateOwner(
        mapApiTemplateToChecklistTemplate(
          rawTemplate as Record<string, unknown>,
          options.identifier,
        ),
        apiClient,
      );
      const ownerSlug = resolvePublicTemplateOwnerSlug(mappedTemplate);

      if (
        !mappedTemplate.isPublic ||
        ownerSlug?.toLowerCase() !== options.ownerUsername.toLowerCase()
      ) {
        return { template: null, notFound: true };
      }

      return { template: mappedTemplate, notFound: false };
    } catch {
      return { template: null, notFound: true };
    }
  }

  const identifier = options.identifier;
  const cachedTemplate =
    options.getCachedTemplate(identifier) ??
    repoTemplates.find((template) => template.id === identifier);
  if (cachedTemplate) {
    return { template: cachedTemplate, notFound: false };
  }

  try {
    let rawTemplate: unknown;

    try {
      rawTemplate = await apiClient.getTemplateById(options.identifier);
    } catch {
      rawTemplate = await apiClient.getTemplateBySlug(options.identifier);
    }

    const mappedTemplate = await hydrateTemplateOwner(
      mapApiTemplateToChecklistTemplate(
        rawTemplate as Record<string, unknown>,
        options.identifier,
      ),
      apiClient,
    );

    return { template: mappedTemplate, notFound: false };
  } catch {
    return { template: null, notFound: true };
  }
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

  if (!params.isAuthenticated || !params.userId) {
    return { kind: 'login_required' };
  }

  // Only Personal copying is a Pro feature. The API enforces an Organization's Template
  // limit (a Free Organization may copy within it) and reports limit_reached, which
  // maps to upgrade_required.
  if (!params.teamId && params.billingState.isLoading) {
    return { kind: 'error', message: 'Checking your plan. Try again in a moment.' };
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
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const queryClient = useQueryClient();
  const workspaceTemplates =
    options.mode === 'private' ? options.workspaceTemplates : undefined;
  // Changes only when the workspace list does, so a refetch reloads the template.
  const getCachedTemplate = useCallback(
    (identifier: string) =>
      workspaceTemplates?.find((template) => template.id === identifier),
    [workspaceTemplates],
  );
  const publicOwnerUsername =
    options.mode === 'public' ? options.ownerUsername : undefined;

  const billing = useQuery({
    queryKey: getBillingStatusQueryKey(options.userId, options.teamId),
    queryFn: () =>
      api.getBillingStatus(options.teamId ? { teamId: options.teamId } : undefined),
    enabled: options.isAuthenticated,
    retry: false,
  });

  const billingState: TemplateDetailBillingState = {
    billingEnabled: billing.data?.billingEnabled ?? true,
    isLoading: options.isAuthenticated && billing.isLoading,
    isPro: billing.data?.plan === 'pro' || billing.data?.plan === 'team',
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
    queryKey: [
      'template-history',
      template?.id ?? 'none',
      options.userId ?? 'guest',
      options.teamId ?? 'personal',
    ],
    queryFn: () => api.getTemplateHistory(template?.id ?? ''),
    enabled: canLoadTemplateHistory,
    retry: false,
  });

  useEffect(() => {
    let cancelled = false;

    const loadTemplate = async () => {
      setLoading(true);
      setNotFound(false);

      const result = await loadTemplateDetailData(
        options.mode === 'public'
          ? {
              identifier: options.identifier,
              mode: 'public',
              ownerUsername: publicOwnerUsername,
            }
          : {
              getCachedTemplate,
              identifier: options.identifier,
              mode: 'private',
            },
      );

      if (cancelled) {
        return;
      }

      setTemplate(result.template);
      setNotFound(result.notFound);
      setLoading(false);
    };

    void loadTemplate();

    return () => {
      cancelled = true;
    };
  }, [
    getCachedTemplate,
    options.identifier,
    options.mode,
    publicOwnerUsername,
  ]);

  const invalidateTemplates = async () => {
    if (!options.userId) {
      return;
    }

    // ['templates'] also covers the public catalog, which Share changes.
    await queryClient.invalidateQueries({ queryKey: ['templates'] });
  };

  const startRun = async (runName?: string): Promise<TemplateDetailActionResult> =>
    startTemplateRun({
      createRun: options.createRun,
      isAuthenticated: options.isAuthenticated,
      runName,
      template,
    });

  const saveTemplate = async (): Promise<TemplateDetailActionResult> =>
    saveTemplateToAccount({
      billingState,
      createTemplate: options.createTemplate,
      invalidateTemplates,
      isAuthenticated: options.isAuthenticated,
      teamId: options.teamId,
      template,
      userId: options.userId,
    });

  // `template` is the only source of visibility; both actions keep it in step with the server.
  const shareTemplate = async (): Promise<TemplateDetailActionResult> =>
    shareTemplateToPublic({
      canShare: permissions.canShare,
      invalidateTemplates,
      isAuthenticated: options.isAuthenticated,
      // Ignore the result if the page moved to another template during the request.
      onTemplateChange: (shared) =>
        setTemplate((current) => (current?.id === shared.id ? shared : current)),
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
      onTemplateChange: setTemplate,
      template,
    });

  return {
    billingState,
    history: {
      data: history.data ?? null,
      isError: history.isError,
      isLoading: canLoadTemplateHistory && history.isLoading,
    } satisfies TemplateDetailHistoryState,
    loading,
    notFound,
    permissions,
    saveTemplate,
    setVisibility,
    shareTemplate,
    startRun,
    template,
    totalItems: template ? countTemplateItems(template) : 0,
  };
};
