import { api } from '@/lib/api';
import { isNotFoundError } from '@/lib/api-errors';
import {
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  getRepoCatalogCreatedAt,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import { mapApiTemplate } from '@/lib/templates/apiTemplateMapper';
import { normalizeDbTimestamp } from '@/lib/utils/dbTimestamp';
import type { ChecklistTemplate } from '@/types/checklist';

export type UserProfileRecord = {
  avatar_url: string | null;
  created_at: string | null;
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

export type LoadUserProfileResult =
  | { kind: 'ok'; profile: ProfileSurfaceRecord; templates: ChecklistTemplate[] }
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

const PROFILE_LOAD_ERROR_MESSAGE = 'Unable to load this public profile.';

const normalizeUsername = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? '';

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

const getBundledLibraryProfile = (
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
      created_at: getRepoCatalogCreatedAt(repoTemplates),
    },
    templates: repoTemplates,
  };
};

const fetchProfile = async (
  username: string,
  apiClient: UserProfileApiClient,
): Promise<UserProfileRecord | 'not_found' | null> => {
  try {
    const profile = await apiClient.getProfileByUsername(username);
    return {
      id: profile.id,
      username: profile.username,
      avatar_url: profile.avatar_url ?? null,
      created_at: normalizeDbTimestamp(profile.created_at),
      full_name: profile.full_name ?? null,
    };
  } catch (error) {
    return isNotFoundError(error) ? 'not_found' : null;
  }
};

const fetchPublicTemplates = async (
  profile: UserProfileRecord,
  apiClient: UserProfileApiClient,
): Promise<ChecklistTemplate[] | null> => {
  try {
    const templates = await apiClient.getPublicTemplatesForUser(profile.id);
    return mergeProfileTemplates(profile.username, templates.map(mapApiTemplate));
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
  const bundledLibraryProfile = getBundledLibraryProfile(
    profile && profile !== 'not_found' ? profile.username : username,
  );

  if (!profile || profile === 'not_found') {
    if (bundledLibraryProfile) {
      return { kind: 'ok', ...bundledLibraryProfile };
    }

    return profile === 'not_found'
      ? { kind: 'not_found' }
      : { kind: 'error', message: PROFILE_LOAD_ERROR_MESSAGE };
  }

  const templates =
    (await fetchPublicTemplates(profile, apiClient)) ?? bundledLibraryProfile?.templates;

  return templates
    ? { kind: 'ok', profile, templates }
    : { kind: 'error', message: PROFILE_LOAD_ERROR_MESSAGE };
};
