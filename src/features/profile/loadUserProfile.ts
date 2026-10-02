import { api } from '@/lib/api';
import { isNotFoundError } from '@/lib/api-errors';
import {
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  getRepoCatalogCreatedAt,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import type { ApiTemplate } from '@/lib/schemas/apiTemplates';
import { templateOwnerProfile } from '@/lib/schemas/templateOwnerProfile';
import { normalizeSections } from '@/lib/utils/checklistSections';
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

export const PROFILE_LOAD_ERROR_MESSAGE = 'Unable to load this public profile.';

const normalizeUsername = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? '';

const mapApiTemplate = (
  template: ApiTemplate,
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
    categories: template.categories ?? [],
    tags: Array.isArray(template.tags) ? template.tags : [],
    version: typeof template.version === 'number' ? template.version : 1,
    ownerProfile: templateOwnerProfile(template),
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
