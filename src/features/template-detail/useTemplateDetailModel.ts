import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getTemplateChangeErrorMessage, isStaleRecordError } from '@/lib/editConflicts';
import { api, type TemplateHistoryResponse } from '@/lib/api';
import { getBillingStatusQueryKey } from '@/lib/billing';
import { findPublicTemplateByIdentifier } from '@/lib/repoTemplateCatalog';
import {
  buildCanonicalPublicTemplatePath,
  resolvePublicTemplateOwnerSlug,
} from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  countTemplateItems,
  mapApiTemplateToChecklistTemplate,
  resolveTemplateOwnerProfile,
} from './templateDetailMappers';
import {
  createTemplateDetailLoader,
  initialTemplateDetailViewState,
  type TemplateDetailViewState,
} from './templateDetailLoader';
import { createTemplateDetailRefresh } from './templateDetailRefresh';
import {
  type CreateRun,
  type CreateTemplate,
  duplicateOwnedTemplate,
  mapActionFailure,
  saveTemplateToAccount,
  startTemplateRun,
  type TemplateDetailActionResult,
  type TemplateDetailBillingState,
} from './templateActionOutcome';

export {
  duplicateOwnedTemplate,
  saveTemplateToAccount,
  startTemplateRun,
  type TemplateDetailActionResult,
  type TemplateDetailBillingState,
};

type TemplateDetailApiClient = Pick<
  typeof api,
  | 'clonePublicTemplate'
  | 'getBillingStatus'
  | 'getProfileById'
  | 'getTemplateById'
  | 'getTemplateBySlug'
  | 'updateTemplate'
>;

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

const hydrateTemplateOwner = async (
  template: ChecklistTemplate,
  apiClient: TemplateDetailApiClient,
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

    const cachedTemplate = findPublicTemplateByIdentifier(
      options.cachedTemplates,
      options.identifier,
      options.ownerUsername,
    );
    if (cachedTemplate) {
      return { template: cachedTemplate, notFound: false };
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

  const cachedTemplate = options.getCachedTemplate(options.identifier);
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

export const useTemplateDetailModel = (
  options: UseTemplateDetailModelOptions,
) => {
  const [view, setView] = useState<TemplateDetailViewState>(initialTemplateDetailViewState);
  const [loader] = useState(() =>
    createTemplateDetailLoader({ load: (source) => loadTemplateDetailData(source), onChange: setView }),
  );
  const { loading, notFound, template } = view;
  const queryClient = useQueryClient();

  // Runs after every render with the latest list data; the loader decides whether to load.
  useEffect(() => {
    loader.sync(
      options.mode === 'public'
        ? {
            cachedTemplates: options.cachedTemplates,
            identifier: options.identifier,
            mode: 'public',
            ownerUsername: options.ownerUsername,
          }
        : {
            getCachedTemplate: options.getCachedTemplate,
            identifier: options.identifier,
            mode: 'private',
          },
      options.userId,
    );
  });
  useEffect(() => () => loader.cancel(), [loader]);

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

  const { invalidateTemplates, recordTemplateSave, reloadTemplate } = createTemplateDetailRefresh({
    loader,
    queryClient,
    template,
    userId: options.userId,
  });

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

  const duplicateTemplate = async (): Promise<TemplateDetailActionResult> =>
    template
      ? duplicateOwnedTemplate({
          activeTeamId: options.teamId,
          createTemplate: options.createTemplate,
          template,
        })
      : { kind: 'error', message: 'Template not found.' };

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
        nextTemplate = {
          ...nextTemplate,
          isPublic: true,
        };
      }

      nextTemplate = await hydrateTemplateOwner(nextTemplate, api);

      if (!nextTemplate.ownerProfile?.username && options.username) {
        nextTemplate = {
          ...nextTemplate,
          ownerProfile: {
            ...nextTemplate.ownerProfile,
            username: options.username,
          },
        };
      }

      const publicPath = buildCanonicalPublicTemplatePath(nextTemplate);

      if (!publicPath) {
        return {
          kind: 'error',
          message:
            'Set a username on your account before sharing templates with the canonical public URL.',
        };
      }

      loader.setTemplate(nextTemplate);
      await invalidateTemplates();

      return {
        kind: 'ok',
        shareUrl: `${window.location.origin}${publicPath}`,
      };
    } catch (error) {
      if (isStaleRecordError(error)) {
        await reloadTemplate();
        return { kind: 'error', message: getTemplateChangeErrorMessage(error, '') };
      }
      return mapActionFailure(
        error,
        'Failed to create a share link for this template.',
      );
    }
  };

  return {
    billingState,
    duplicateTemplate,
    history: {
      data: history.data ?? null,
      isError: history.isError,
      isLoading: canLoadTemplateHistory && history.isLoading,
    } satisfies TemplateDetailHistoryState,
    loading,
    notFound,
    recordTemplateSave,
    reloadTemplate,
    saveTemplate,
    shareTemplate,
    startRun,
    template,
    totalItems: template ? countTemplateItems(template) : 0,
  };
};
