import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getAccessFailure, isNotFoundError } from '@/lib/api-errors';
import { api, type TemplateHistoryResponse } from '@/lib/api';
import { getBillingStatusQueryKey } from '@/lib/billing';
import { queryKeys, refreshTemplateHistory } from '@/lib/queryCache';
import {
  buildRepoTemplateCreatePayload,
  findPublicTemplateByIdentifier,
  isRepoTemplate,
} from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/routes';
import type { ChecklistRun, ChecklistTemplate } from '@/types/checklist';

import {
  countTemplateItems,
  mapApiTemplateToChecklistTemplate,
  resolveTemplateOwnerProfile,
} from './templateDetailMappers';

type TemplateDetailApiClient = Pick<
  typeof api,
  | 'clonePublicTemplate'
  | 'getBillingStatus'
  | 'getProfileById'
  | 'getTemplateById'
  | 'getTemplateBySlug'
  | 'updateTemplate'
>;

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

type PublicTemplateDetailOptions = {
  cachedTemplates: ChecklistTemplate[];
  identifier?: string;
  mode: 'public';
  ownerUsername?: string;
};

type PrivateTemplateDetailOptions = {
  getCachedTemplate: (identifier: string) => ChecklistTemplate | undefined;
  identifier?: string;
  mode: 'private';
};

type TemplateDetailCommonOptions = {
  createRun: CreateRun;
  createTemplate: CreateTemplate;
  isAuthenticated: boolean;
  teamId?: string;
  userId?: string;
  username?: string;
};

export type UseTemplateDetailModelOptions = TemplateDetailCommonOptions &
  (PublicTemplateDetailOptions | PrivateTemplateDetailOptions);

export type TemplateDetailActionResult =
  | { kind: 'ok'; runId?: string; shareUrl?: string; templateId?: string }
  | { kind: 'login_required' }
  | { kind: 'upgrade_required' }
  | { kind: 'error'; message: string };

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

// notFound is settled (the page may say so to crawlers); loadError may be transient.
type LoadTemplateDetailResult = {
  loadError: boolean;
  notFound: boolean;
  template: ChecklistTemplate | null;
};

const NOT_FOUND: LoadTemplateDetailResult = { loadError: false, notFound: true, template: null };
const found = (template: ChecklistTemplate): LoadTemplateDetailResult => ({
  loadError: false,
  notFound: false,
  template,
});

type TemplateDetailDependencies = {
  apiClient?: TemplateDetailApiClient;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuidLike = (value: string): boolean => UUID_PATTERN.test(value);

const getApiClient = (
  dependencies?: TemplateDetailDependencies,
): TemplateDetailApiClient => dependencies?.apiClient ?? api;

const mapActionFailure = (
  error: unknown,
  fallbackMessage: string,
): TemplateDetailActionResult => {
  const failure = getAccessFailure(error, fallbackMessage);

  if (failure.kind === 'auth_required') {
    return { kind: 'login_required' };
  }

  if (failure.kind === 'upgrade_required') {
    return { kind: 'upgrade_required' };
  }

  return { kind: 'error', message: failure.message };
};

const hydrateTemplateOwner = async (
  template: ChecklistTemplate,
  apiClient: Pick<TemplateDetailApiClient, 'getProfileById'>,
): Promise<ChecklistTemplate> => {
  const { ownerSlug } = resolveTemplateOwnerProfile(template);

  if (ownerSlug || !template.userId) {
    return template;
  }

  try {
    const profile = (await apiClient.getProfileById(
      template.userId,
    )) as Record<string, unknown>;
    return resolveTemplateOwnerProfile(template, profile).template;
  } catch {
    return template;
  }
};

/**
 * The template with the owner name its share link should use. Cached lists
 * carry the username from when they were fetched, which is stale after a
 * rename, so the signed-in owner's current username wins.
 */
export const resolveShareOwnerTemplate = async (
  template: ChecklistTemplate,
  owner: { userId?: string; username?: string },
  apiClient: Pick<TemplateDetailApiClient, 'getProfileById'>,
): Promise<ChecklistTemplate> => {
  const username = owner.username?.trim();
  if (username && owner.userId && template.userId === owner.userId) {
    return { ...template, ownerProfile: { ...template.ownerProfile, username } };
  }

  return hydrateTemplateOwner(template, apiClient);
};

export const loadTemplateDetailData = async (
  options: PublicTemplateDetailOptions | PrivateTemplateDetailOptions,
  dependencies?: TemplateDetailDependencies,
): Promise<LoadTemplateDetailResult> => {
  const apiClient = getApiClient(dependencies);

  if (!options.identifier) {
    return NOT_FOUND;
  }

  if (options.mode === 'public') {
    if (!options.ownerUsername) {
      return NOT_FOUND;
    }

    const cachedTemplate = findPublicTemplateByIdentifier(
      options.cachedTemplates,
      options.identifier,
    );
    if (cachedTemplate) {
      const ownerSlug = resolvePublicTemplateOwnerSlug(cachedTemplate);
      if (ownerSlug?.toLowerCase() === options.ownerUsername.toLowerCase()) {
        return found(cachedTemplate);
      }
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
        return NOT_FOUND;
      }

      return found(mappedTemplate);
    } catch (error) {
      // The API answers 404 for a missing, deleted or private template. Any other failure may
      // be transient, so the page offers a retry instead of telling crawlers it is gone.
      return isNotFoundError(error)
        ? NOT_FOUND
        : { loadError: true, notFound: false, template: null };
    }
  }

  const cachedTemplate = options.getCachedTemplate(options.identifier);
  if (cachedTemplate) {
    return found(cachedTemplate);
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

    return found(mappedTemplate);
  } catch {
    return NOT_FOUND;
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

  if (params.billingState.isLoading) {
    return { kind: 'error', message: 'Checking your plan. Try again in a moment.' };
  }

  if (!params.billingState.isPro) {
    return { kind: 'upgrade_required' };
  }

  const apiClient = params.apiClient ?? api;

  try {
    if (isRepoTemplate(params.template)) {
      const createdTemplate = await params.createTemplate(
        buildRepoTemplateCreatePayload(params.template),
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
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const queryClient = useQueryClient();
  const cachedTemplates =
    options.mode === 'public' ? options.cachedTemplates : null;
  const getCachedTemplate =
    options.mode === 'private' ? options.getCachedTemplate : null;
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
  const canLoadTemplateHistory =
    options.mode === 'private' &&
    options.isAuthenticated &&
    Boolean(template?.id) &&
    (template?.userId === options.userId ||
      (Boolean(options.teamId) && template?.teamId === options.teamId));

  const history = useQuery({
    queryKey: queryKeys.templateHistoryFor(template?.id ?? 'none', options.userId, options.teamId),
    queryFn: () => api.getTemplateHistory(template?.id ?? ''),
    enabled: canLoadTemplateHistory,
    retry: false,
  });

  useEffect(() => {
    let cancelled = false;

    const loadTemplate = async () => {
      setLoading(true);
      setNotFound(false);
      setLoadError(false);

      const result = await loadTemplateDetailData(
        options.mode === 'public'
          ? {
              cachedTemplates: cachedTemplates ?? [],
              identifier: options.identifier,
              mode: 'public',
              ownerUsername: publicOwnerUsername,
            }
          : {
              getCachedTemplate:
                getCachedTemplate ?? (() => undefined),
              identifier: options.identifier,
              mode: 'private',
            },
      );

      if (cancelled) {
        return;
      }

      setTemplate(result.template);
      setNotFound(result.notFound);
      setLoadError(result.loadError);
      setLoading(false);
    };

    void loadTemplate();

    return () => {
      cancelled = true;
    };
  }, [
    cachedTemplates,
    getCachedTemplate,
    loadAttempt,
    options.identifier,
    options.mode,
    publicOwnerUsername,
  ]);

  const invalidateTemplates = async () => {
    if (!options.userId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ['templates', options.userId],
    });
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

  const shareTemplate = async (): Promise<TemplateDetailActionResult> => {
    if (!template) {
      return { kind: 'error', message: 'Template not found.' };
    }

    if (!options.isAuthenticated || !options.userId) {
      return { kind: 'login_required' };
    }

    if (template.userId !== options.userId) {
      return {
        kind: 'error',
        message: 'You can only share templates you own.',
      };
    }

    try {
      let nextTemplate = template;

      if (!nextTemplate.isPublic) {
        await api.updateTemplate(nextTemplate.id, {
          is_public: true,
          expected_version: nextTemplate.version,
        });
        void refreshTemplateHistory(queryClient, nextTemplate.id);
        nextTemplate = {
          ...nextTemplate,
          isPublic: true,
        };
      }

      nextTemplate = await resolveShareOwnerTemplate(
        nextTemplate,
        { userId: options.userId, username: options.username },
        api,
      );

      const publicPath = buildCanonicalPublicTemplatePath(nextTemplate);

      if (!publicPath) {
        return {
          kind: 'error',
          message:
            'Set a username on your account before sharing templates with the canonical public URL.',
        };
      }

      setTemplate(nextTemplate);
      await invalidateTemplates();

      return {
        kind: 'ok',
        shareUrl: `${window.location.origin}${publicPath}`,
      };
    } catch (error) {
      return mapActionFailure(
        error,
        'Failed to create a share link for this template.',
      );
    }
  };

  return {
    billingState,
    history: {
      data: history.data ?? null,
      isError: history.isError,
      isLoading: canLoadTemplateHistory && history.isLoading,
    } satisfies TemplateDetailHistoryState,
    loadError,
    loading,
    notFound,
    retry: () => setLoadAttempt((attempt) => attempt + 1),
    saveTemplate,
    shareTemplate,
    startRun,
    template,
    totalItems: template ? countTemplateItems(template) : 0,
  };
};
