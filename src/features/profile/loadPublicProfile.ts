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
import type { PublicProfileBody } from '@/lib/schemas/publicProfiles';
import { mapApiTemplate } from '@/lib/templates/apiTemplateMapper';
import { normalizeDbTimestamp } from '@/lib/utils/dbTimestamp';
import type { ChecklistTemplate } from '@/types/checklist';

type UserProfileRecord = {
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

type OrganizationProfileRecord = {
  avatar_url: string | null;
  description: string | null;
  handle: string;
  name: string;
};

export type PublicProfileApiClient = Pick<
  typeof api,
  'getPublicProfileByHandle' | 'getPublicTemplatesForUser' | 'getPublicTemplatesForOrganization'
>;

export type FoundPublicProfile =
  | { kind: 'user'; profile: ProfileSurfaceRecord; templates: ChecklistTemplate[] }
  | { kind: 'organization'; organization: OrganizationProfileRecord; templates: ChecklistTemplate[] };

export type LoadPublicProfileResult =
  | FoundPublicProfile
  | { kind: 'not_found' }
  | { kind: 'error'; message: string };

const PROFILE_LOAD_ERROR_MESSAGE = 'Unable to load this public profile.';

const loadFailed: LoadPublicProfileResult = { kind: 'error', message: PROFILE_LOAD_ERROR_MESSAGE };

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

const fetchProfileOwner = async (
  handle: string,
  apiClient: PublicProfileApiClient,
): Promise<PublicProfileBody | 'not_found' | null> => {
  try {
    return await apiClient.getPublicProfileByHandle(handle);
  } catch (error) {
    return isNotFoundError(error) ? 'not_found' : null;
  }
};

const fetchTemplates = async (load: () => Promise<ApiTemplate[]>): Promise<ChecklistTemplate[] | null> => {
  try {
    return (await load()).map(mapApiTemplate);
  } catch {
    return null;
  }
};

const toUserProfile = (profile: Extract<PublicProfileBody, { type: 'user' }>): UserProfileRecord => ({
  id: profile.id,
  username: profile.username,
  avatar_url: profile.avatar_url ?? null,
  created_at: normalizeDbTimestamp(profile.created_at),
  full_name: profile.full_name ?? null,
});

const loadOrganizationProfile = async (
  owner: Extract<PublicProfileBody, { type: 'team' }>,
  apiClient: PublicProfileApiClient,
): Promise<LoadPublicProfileResult> => {
  const templates = await fetchTemplates(() => apiClient.getPublicTemplatesForOrganization(owner.handle));
  if (!templates) return loadFailed;

  return {
    kind: 'organization',
    organization: {
      avatar_url: owner.avatar_url ?? null,
      description: owner.description ?? null,
      handle: owner.handle,
      name: owner.name,
    },
    templates,
  };
};

const loadUserProfile = async (
  handle: string,
  owner: PublicProfileBody | 'not_found' | null,
  apiClient: PublicProfileApiClient,
): Promise<LoadPublicProfileResult> => {
  const profile = owner && owner !== 'not_found' && owner.type === 'user' ? toUserProfile(owner) : null;
  const bundledLibraryProfile = getBundledLibraryProfile(profile ? profile.username : handle);

  if (!profile) {
    if (bundledLibraryProfile) {
      return { kind: 'user', ...bundledLibraryProfile };
    }

    return owner === 'not_found' ? { kind: 'not_found' } : loadFailed;
  }

  const templates = await fetchTemplates(() => apiClient.getPublicTemplatesForUser(profile.id));
  const shown = templates ? mergeProfileTemplates(profile.username, templates) : bundledLibraryProfile?.templates;

  return shown ? { kind: 'user', profile, templates: shown } : loadFailed;
};

export const loadPublicProfile = async (
  handle: string | undefined,
  dependencies?: { apiClient?: PublicProfileApiClient },
): Promise<LoadPublicProfileResult> => {
  if (!handle) {
    return { kind: 'not_found' };
  }

  const apiClient = dependencies?.apiClient ?? api;
  const owner = await fetchProfileOwner(handle, apiClient);

  return owner && owner !== 'not_found' && owner.type === 'team'
    ? loadOrganizationProfile(owner, apiClient)
    : loadUserProfile(handle, owner, apiClient);
};

export const foundProfileHandle = (found: FoundPublicProfile): string =>
  found.kind === 'user' ? found.profile.username : found.organization.handle;
