import { api } from '@/lib/api';
import { getAccessFailure, isNotFoundError } from '@/lib/api-errors';
import {
  findPublicTemplateByIdentifier,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import { resolvePublicTemplateOwnerSlug } from '@/lib/routes';
import { looksLikeTemplateId } from '@/lib/utils/slug';
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

const classifyLoadFailure = (error: unknown): LoadTemplateDetailResult =>
  isNotFoundError(error)
    ? { kind: 'not_found' }
    : { kind: 'error', message: getAccessFailure(error, 'Unable to load template.').message };

// The app links a private template by its id, and the API never hands out a slug that
// looks like one, so only a 404 for another identifier is worth a slug lookup.
const fetchPrivateTemplate = async (
  identifier: string,
  apiClient: TemplateDetailApiClient,
): Promise<unknown> => {
  try {
    return await apiClient.getTemplateById(identifier);
  } catch (error) {
    if (looksLikeTemplateId(identifier) || !isNotFoundError(error)) {
      throw error;
    }
  }

  return apiClient.getTemplateBySlug(identifier);
};

// The template with this id, or null when there is none (404).
const findTemplateById = async (
  identifier: string,
  apiClient: TemplateDetailApiClient,
): Promise<unknown> => {
  try {
    return await apiClient.getTemplateById(identifier);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
};

// The template as the public page shows it, or null when it is not public or another
// user owns it.
const toOwnedPublicTemplate = async (
  rawTemplate: unknown,
  options: { identifier: string; ownerUsername: string },
  apiClient: TemplateDetailApiClient,
): Promise<ChecklistTemplate | null> => {
  const mappedTemplate = await hydrateTemplateOwner(
    mapApiTemplateToChecklistTemplate(
      rawTemplate as Record<string, unknown>,
      options.identifier,
    ),
    apiClient,
  );
  const ownerSlug = resolvePublicTemplateOwnerSlug(mappedTemplate);

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

    const publicOptions = {
      identifier: options.identifier,
      ownerUsername: options.ownerUsername,
    };
    try {
      // A UUID is read as an id first. A slug saved before the API refused UUID slugs can
      // look like one too, so when the id finds nothing this owner shares, try the slug.
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
