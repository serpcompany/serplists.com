import { api } from '@/lib/api';
import { isNotFoundError } from '@/lib/api-errors';
import {
  REPO_TEMPLATE_OWNER_NAME,
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
  repoTemplates,
} from '@/lib/repoTemplateCatalog';
import { normalizeSections } from '@/lib/utils/checklistSections';
import type { ChecklistTemplate } from '@/types/checklist';

export type UserProfileRecord = {
  id: string;
  full_name: string | null;
  username: string;
  avatar_url: string | null;
  created_at: string;
};

export type ProfileSurfaceRecord = UserProfileRecord & {
  bio?: string;
  location?: string;
  totalRuns?: number;
  totalViews?: number;
  website?: string;
};

// not_found is settled (the page may tell crawlers so); error may be transient.
export type PublicProfileLoadResult =
  | { status: 'found'; profile: ProfileSurfaceRecord; templates: ChecklistTemplate[] }
  | { status: 'not_found' }
  | { status: 'error' };

type PublicProfileApiClient = Pick<
  typeof api,
  'getProfileByUsername' | 'getPublicTemplatesForUser'
>;

const normalizeUsername = (value: string | undefined) =>
  value?.trim().toLowerCase() ?? '';

const getFallbackProfile = (username: string): ProfileSurfaceRecord | null =>
  normalizeUsername(username) === REPO_TEMPLATE_OWNER_SLUG
    ? {
        id: REPO_TEMPLATE_USER_ID,
        full_name: REPO_TEMPLATE_OWNER_NAME,
        username: REPO_TEMPLATE_OWNER_SLUG,
        avatar_url: null,
        created_at: repoTemplates[0]?.createdAt || new Date().toISOString(),
      }
    : null;

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

export const loadPublicProfile = async (
  username: string | undefined,
  apiClient: PublicProfileApiClient = api,
): Promise<PublicProfileLoadResult> => {
  if (!username) {
    return { status: 'not_found' };
  }

  let profile: UserProfileRecord;
  try {
    profile = (await apiClient.getProfileByUsername(username)) as UserProfileRecord;
  } catch (error) {
    console.error('Error fetching public profile:', error);

    // The official profile can always be shown from the bundled templates.
    const fallbackProfile = getFallbackProfile(username);
    if (fallbackProfile) {
      return { status: 'found', profile: fallbackProfile, templates: repoTemplates };
    }

    // The API answers 404 for an unknown username. Any other failure may be transient, so the
    // page offers a retry instead of telling crawlers the profile is gone.
    return isNotFoundError(error) ? { status: 'not_found' } : { status: 'error' };
  }

  try {
    const publicTemplates = (await apiClient.getPublicTemplatesForUser(
      profile.id,
    )) as Array<Record<string, unknown>>;

    return {
      status: 'found',
      profile,
      templates: mergeProfileTemplates(
        profile.username,
        publicTemplates.map(mapApiTemplate),
      ),
    };
  } catch (error) {
    console.error('Error fetching public templates:', error);

    return getFallbackProfile(profile.username)
      ? { status: 'found', profile, templates: repoTemplates }
      : { status: 'error' };
  }
};
