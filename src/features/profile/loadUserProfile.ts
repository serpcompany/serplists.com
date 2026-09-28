import { z } from 'zod';

import { api } from '@/lib/api';
import { isApiError } from '@/lib/api-errors';
import {
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import { normalizeSections } from '@/lib/utils/checklistSections';
import type { ChecklistTemplate } from '@/types/checklist';

// GET /api/profiles/by-username, parsed at the boundary instead of cast.
const userProfileSchema = z.object({
  avatar_url: z.string().nullable().optional(),
  created_at: z.string(),
  full_name: z.string().nullable().optional(),
  id: z.string().min(1),
  username: z.string().min(1),
});

const publicTemplateRowsSchema = z.array(z.record(z.unknown()));

export type UserProfileRecord = {
  avatar_url: string | null;
  created_at: string;
  full_name: string | null;
  id: string;
  username: string;
};

export type ProfileSurfaceRecord = UserProfileRecord & {
  bio?: string;
  location?: string;
  totalRuns?: number;
  totalViews?: number;
  website?: string;
};

export type UserProfileApiClient = Pick<
  typeof api,
  'getProfileByUsername' | 'getPublicTemplatesForUser'
>;

// not_found only when the API says the user does not exist; any other failure can be retried.
export type LoadUserProfileResult =
  | { kind: 'ok'; profile: ProfileSurfaceRecord; templates: ChecklistTemplate[] }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

export const PROFILE_LOAD_ERROR_MESSAGE = 'Unable to load this public profile.';

const normalizeUsername = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? '';

const mapApiTemplate = (
  template: Record<string, unknown>,
): ChecklistTemplate => {
  const sections = Array.isArray(template.sections)
    ? template.sections
    : Array.isArray(template.items)
      ? [
          {
            id: '1',
            title: 'Checklist',
            items: template.items,
          },
        ]
      : [];

  return {
    id: String(template.id),
    title: String(template.title),
    description:
      typeof template.description === 'string' ? template.description : '',
    sections: normalizeSections(sections),
    userId: String(template.user_id),
    createdAt: String(template.created_at),
    updatedAt:
      typeof template.updated_at === 'string'
        ? template.updated_at
        : String(template.created_at),
    isPublic: Boolean(template.is_public ?? true),
    slug: typeof template.slug === 'string' ? template.slug : '',
    categories: Array.isArray(template.categories)
      ? (template.categories as string[])
      : [],
    tags: Array.isArray(template.tags) ? (template.tags as string[]) : [],
    version: typeof template.version === 'number' ? template.version : 1,
    ownerProfile:
      typeof template.owner_username === 'string' ||
      typeof template.owner_full_name === 'string'
        ? {
            username:
              typeof template.owner_username === 'string'
                ? template.owner_username
                : undefined,
            full_name:
              typeof template.owner_full_name === 'string'
                ? template.owner_full_name
                : undefined,
          }
        : undefined,
  };
};

const mergeProfileTemplates = (
  username: string,
  apiTemplates: ChecklistTemplate[],
): ChecklistTemplate[] => {
  const merged = new Map<string, ChecklistTemplate>();
  const sources =
    normalizeUsername(username) === REPO_TEMPLATE_OWNER_SLUG
      ? [...repoTemplates, ...apiTemplates]
      : apiTemplates;

  sources.forEach((template) => {
    const key = template.slug?.trim() || template.id;
    if (!merged.has(key)) {
      merged.set(key, template);
    }
  });

  return Array.from(merged.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
};

// The library profile ships in the bundle, so it renders even when the API is down.
const getFallbackProfileState = (
  username: string | undefined,
): { profile: ProfileSurfaceRecord; templates: ChecklistTemplate[] } | null => {
  if (normalizeUsername(username) !== REPO_TEMPLATE_OWNER_SLUG) {
    return null;
  }

  return {
    profile: {
      id: REPO_TEMPLATE_USER_ID,
      full_name: REPO_TEMPLATE_OWNER_NAME,
      username: REPO_TEMPLATE_OWNER_SLUG,
      avatar_url: null,
      created_at: repoTemplates[0]?.createdAt || new Date().toISOString(),
    },
    templates: repoTemplates,
  };
};

const fetchProfile = async (
  username: string,
  apiClient: UserProfileApiClient,
): Promise<UserProfileRecord | 'not_found' | null> => {
  try {
    const parsed = userProfileSchema.safeParse(
      await apiClient.getProfileByUsername(username),
    );
    if (!parsed.success) {
      return null;
    }

    return {
      ...parsed.data,
      avatar_url: parsed.data.avatar_url ?? null,
      full_name: parsed.data.full_name ?? null,
    };
  } catch (error) {
    return isApiError(error) && error.status === 404 ? 'not_found' : null;
  }
};

const fetchPublicTemplates = async (
  profile: UserProfileRecord,
  apiClient: UserProfileApiClient,
): Promise<ChecklistTemplate[] | null> => {
  try {
    const parsed = publicTemplateRowsSchema.safeParse(
      await apiClient.getPublicTemplatesForUser(profile.id),
    );
    return parsed.success
      ? mergeProfileTemplates(profile.username, parsed.data.map(mapApiTemplate))
      : null;
  } catch {
    return null;
  }
};

export const loadUserProfile = async (
  username: string | undefined,
  dependencies?: { apiClient?: UserProfileApiClient },
): Promise<LoadUserProfileResult> => {
  if (!username) {
    return { kind: 'not_found' };
  }

  const apiClient = dependencies?.apiClient ?? api;
  const profile = await fetchProfile(username, apiClient);
  const fallbackState = getFallbackProfileState(
    profile && profile !== 'not_found' ? profile.username : username,
  );

  if (!profile || profile === 'not_found') {
    if (fallbackState) {
      return { kind: 'ok', ...fallbackState };
    }

    return profile === 'not_found'
      ? { kind: 'not_found' }
      : { kind: 'error', message: PROFILE_LOAD_ERROR_MESSAGE };
  }

  const templates =
    (await fetchPublicTemplates(profile, apiClient)) ?? fallbackState?.templates;

  return templates
    ? { kind: 'ok', profile, templates }
    : { kind: 'error', message: PROFILE_LOAD_ERROR_MESSAGE };
};
