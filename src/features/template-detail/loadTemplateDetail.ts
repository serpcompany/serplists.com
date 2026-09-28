import { api } from '@/lib/api';
import { getAccessFailure, isApiError } from '@/lib/api-errors';
import {
  findPublicTemplateByIdentifier,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import { resolvePublicTemplateOwnerSlug } from '@/lib/routes';
import type { ChecklistTemplate } from '@/types/checklist';

import {
  hydrateTemplateOwner,
  type TemplateDetailApiClient,
} from './templateDetailApi';
import { mapApiTemplateToChecklistTemplate } from './templateDetailMappers';

// Public pages always read the server copy: an in-memory list can be arbitrarily old.
export type PublicTemplateDetailOptions = {
  identifier?: string;
  mode: 'public';
  ownerUsername?: string;
};

// The private page loads its own template by id (or slug), never from a list.
export type PrivateTemplateDetailOptions = {
  identifier?: string;
  mode: 'private';
};

// not_found is only for a real answer (404, not public, another owner); anything else can be retried.
export type LoadTemplateDetailResult =
  | { kind: 'ok'; template: ChecklistTemplate }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

export type TemplateDetailDependencies = {
  apiClient?: TemplateDetailApiClient;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuidLike = (value: string): boolean => UUID_PATTERN.test(value);

const isNotFoundError = (error: unknown): boolean =>
  isApiError(error) && error.status === 404;

const classifyLoadFailure = (error: unknown): LoadTemplateDetailResult =>
  isNotFoundError(error)
    ? { kind: 'not_found' }
    : { kind: 'error', message: getAccessFailure(error, 'Unable to load template.').message };

// A slug never looks like an id, so only a 404 for another identifier is worth a slug lookup.
const fetchPrivateTemplate = async (
  identifier: string,
  apiClient: TemplateDetailApiClient,
): Promise<unknown> => {
  try {
    return await apiClient.getTemplateById(identifier);
  } catch (error) {
    if (isUuidLike(identifier) || !isNotFoundError(error)) {
      throw error;
    }
  }

  return apiClient.getTemplateBySlug(identifier);
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
      return { kind: 'ok', template: libraryTemplate };
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
        return { kind: 'not_found' };
      }

      return { kind: 'ok', template: mappedTemplate };
    } catch (error) {
      return classifyLoadFailure(error);
    }
  }

  const identifier = options.identifier;
  // Library templates are not in D1, in any context.
  const libraryTemplate = repoTemplates.find((template) => template.id === identifier);
  if (libraryTemplate) {
    return { kind: 'ok', template: libraryTemplate };
  }

  try {
    const rawTemplate = await fetchPrivateTemplate(identifier, apiClient);
    const mappedTemplate = await hydrateTemplateOwner(
      mapApiTemplateToChecklistTemplate(
        rawTemplate as Record<string, unknown>,
        identifier,
      ),
      apiClient,
    );

    return { kind: 'ok', template: mappedTemplate };
  } catch (error) {
    return classifyLoadFailure(error);
  }
};
