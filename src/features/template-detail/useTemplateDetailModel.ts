import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getAccessFailure } from '@/lib/api-errors';
import { api, type TemplateHistoryResponse } from '@/lib/api';
import { getBillingStatusQueryKey } from '@/lib/billing';
import {
  buildRepoTemplateCreatePayload,
  findPublicTemplateByIdentifier,
  isRepoTemplate,
  repoTemplates,
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

const SHARE_FAILED_MESSAGE = 'Failed to create a share link for this template.';

// Resolves the public URL before changing visibility, so a template that cannot
// be shared is never published, and once it is published local state follows.
export const shareTemplateToPublic = async (params: {
  apiClient?: TemplateDetailApiClient;
  invalidateTemplates?: () => Promise<void> | void;
  isAuthenticated: boolean;
  isPublic?: boolean;
  onTemplateChange: (template: ChecklistTemplate) => void;
  origin: string;
  template: ChecklistTemplate | null;
  userId?: string;
  username?: string;
}): Promise<TemplateDetailActionResult> => {
  if (!params.template) {
    return { kind: 'error', message: 'Template not found.' };
  }
  if (!params.isAuthenticated || !params.userId) {
    return { kind: 'login_required' };
  }
  if (params.template.userId !== params.userId) {
    return { kind: 'error', message: 'You can only share templates you own.' };
  }

  const apiClient = params.apiClient ?? api;
  let nextTemplate = await hydrateTemplateOwner(params.template, apiClient);
  if (!nextTemplate.ownerProfile?.username && params.username) {
    nextTemplate = {
      ...nextTemplate,
      ownerProfile: { ...nextTemplate.ownerProfile, username: params.username },
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

  if (!(params.isPublic ?? nextTemplate.isPublic)) {
    try {
      await apiClient.updateTemplate(nextTemplate.id, {
        is_public: true,
        expected_version: nextTemplate.version,
      });
    } catch (error) {
      return mapActionFailure(error, SHARE_FAILED_MESSAGE);
    }
  }

  params.onTemplateChange({ ...nextTemplate, isPublic: true });
  try {
    await params.invalidateTemplates?.();
  } catch {
    // The template is public either way; lists catch up on their next fetch.
  }

  return { kind: 'ok', shareUrl: `${params.origin}${publicPath}` };
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

  // isPublic is the visibility the page shows, which can be newer than `template`.
  const shareTemplate = async (
    isPublic?: boolean,
  ): Promise<TemplateDetailActionResult> =>
    shareTemplateToPublic({
      invalidateTemplates,
      isAuthenticated: options.isAuthenticated,
      isPublic,
      onTemplateChange: setTemplate,
      origin: window.location.origin,
      template,
      userId: options.userId,
      username: options.username,
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
    saveTemplate,
    shareTemplate,
    startRun,
    template,
    totalItems: template ? countTemplateItems(template) : 0,
  };
};
