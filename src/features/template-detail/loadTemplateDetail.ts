import { api } from '@/lib/api';
import { getAccessFailure, isNotFoundError } from '@/lib/api-errors';
import {
  findPublicTemplateByIdentifier,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import { resolvePublicTemplateOwnerSlug } from '@/lib/routes';
import { looksLikeTemplateId } from '@/lib/utils/slug';
import type { ApiTemplate } from '@/lib/schemas/apiTemplates';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  hydrateTemplateOwner,
  type TemplateDetailApiClient,
} from './templateDetailApi';
import { mapApiTemplateToChecklistTemplate } from './templateDetailMappers';

export type PublicTemplateDetailOptions = {
  identifier?: string | undefined;
  mode: 'public';
  ownerUsername?: string | undefined;
};

export type PrivateTemplateDetailOptions = {
  identifier?: string | undefined;
  mode: 'private';
};

export type LoadTemplateDetailResult =
  | { kind: 'ok'; template: ChecklistTemplate }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

export type TemplateDetailDependencies = {
  apiClient?: TemplateDetailApiClient | undefined;
};

const classifyLoadFailure = (error: unknown): LoadTemplateDetailResult =>
  isNotFoundError(error)
    ? { kind: 'not_found' }
    : { kind: 'error', message: getAccessFailure(error, 'Unable to load template.').message };

const fetchPrivateTemplate = async (
  identifier: string,
  apiClient: TemplateDetailApiClient,
): Promise<ApiTemplate> => {
  try {
    return await apiClient.getTemplateById(identifier);
  } catch (error) {
    if (looksLikeTemplateId(identifier) || !isNotFoundError(error)) {
      throw error;
    }
  }

  return apiClient.getTemplateBySlug(identifier);
};

const findTemplateById = async (
  identifier: string,
  apiClient: TemplateDetailApiClient,
): Promise<ApiTemplate | null> => {
  try {
    return await apiClient.getTemplateById(identifier);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
};

const templateOwnerHandleOf = (template: ChecklistTemplate): string | null => {
  const { owner } = template;
  if (owner?.type !== 'team') return resolvePublicTemplateOwnerSlug(template);
  return 'publicHandle' in owner ? owner.publicHandle?.trim() || null : null;
};

const toOwnedPublicTemplate = async (
  rawTemplate: ApiTemplate,
  options: { identifier: string; ownerUsername: string },
  apiClient: TemplateDetailApiClient,
): Promise<ChecklistTemplate | null> => {
  const mappedTemplate = await hydrateTemplateOwner(
    mapApiTemplateToChecklistTemplate(rawTemplate, options.identifier),
    apiClient,
  );
  const ownerSlug = templateOwnerHandleOf(mappedTemplate);

  return mappedTemplate.isPublic &&
    ownerSlug?.toLowerCase() === options.ownerUsername.toLowerCase()
    ? mappedTemplate
    : null;
};

export const loadTemplateDetailData = async (
  options: PublicTemplateDetailOptions | PrivateTemplateDetailOptions,
  dependencies?: TemplateDetailDependencies,
): Promise<LoadTemplateDetailResult> => {
  const apiClient = dependencies?.apiClient ?? api;

  if (!options.identifier) {
    return { kind: 'not_found' };
  }

  if (options.mode === 'public') {
    if (!options.ownerUsername) {
      return { kind: 'not_found' };
    }

    const libraryTemplate = findPublicTemplateByIdentifier(
      repoTemplates,
      options.identifier,
    );
    if (
      libraryTemplate &&
      resolvePublicTemplateOwnerSlug(libraryTemplate)?.toLowerCase() ===
        options.ownerUsername.toLowerCase()
    ) {
      return { kind: 'ok', template: libraryTemplate };
    }

    const publicOptions = {
      identifier: options.identifier,
      ownerUsername: options.ownerUsername,
    };
    try {
      if (looksLikeTemplateId(publicOptions.identifier)) {
        const byId = await findTemplateById(publicOptions.identifier, apiClient);
        const template =
          byId === null
            ? null
            : await toOwnedPublicTemplate(byId, publicOptions, apiClient);
        if (template) {
          return { kind: 'ok', template };
        }
      }

      const template = await toOwnedPublicTemplate(
        await apiClient.getTemplateBySlug(publicOptions.identifier),
        publicOptions,
        apiClient,
      );
      return template ? { kind: 'ok', template } : { kind: 'not_found' };
    } catch (error) {
      return classifyLoadFailure(error);
    }
  }

  const identifier = options.identifier;
  const libraryTemplate = repoTemplates.find((template) => template.id === identifier);
  if (libraryTemplate) {
    return { kind: 'ok', template: libraryTemplate };
  }

  try {
    const rawTemplate = await fetchPrivateTemplate(identifier, apiClient);
    const mappedTemplate = await hydrateTemplateOwner(
      mapApiTemplateToChecklistTemplate(rawTemplate, identifier),
      apiClient,
    );

    return { kind: 'ok', template: mappedTemplate };
  } catch (error) {
    return classifyLoadFailure(error);
  }
};
