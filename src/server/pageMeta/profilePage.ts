import 'server-only';

import { cache } from 'react';
import { z } from 'zod';

import { describeErrorForLog, log } from '@functions/api/utils/logger';
import { withEdgeCache } from '@functions/api/utils/edge-cache';
import { loadUserProfile, type UserProfileApiClient } from '@/features/profile/loadUserProfile';
import {
  buildProfileSummary,
  calculateStats,
  getProfileDisplayName,
} from '@/features/profile/profileSummary';
import { PROFILE_NOT_FOUND_PAGE_TEXT } from '@/lib/publicPageMeta';
import { publicProfileSchema } from '@/lib/schemas/accountResponses';
import { apiTemplateListSchema } from '@/lib/schemas/apiTemplates';
import { buildPublicProfilePath } from '@/lib/routes';

import { fetchApiJson } from '../api';
import { getRequestOrigin } from '../cloudflare';
import type { PageSeoLookup } from './pageSeoLookup';

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_KEY_PREFIX = '/__page-meta/v1/profiles/';

const foundProfileSchema = z.object({
  title: z.string(),
  description: z.string(),
  username: z.string(),
});

const profileApi: UserProfileApiClient = {
  getProfileByUsername: (username: string) =>
    fetchApiJson(`/api/profiles/by-username?username=${encodeURIComponent(username)}`, publicProfileSchema),
  getPublicTemplatesForUser: (userId: string) =>
    fetchApiJson(`/api/templates/public?userId=${encodeURIComponent(userId)}`, apiTemplateListSchema),
};

export const loadProfilePageSeo = cache(async (username: string): Promise<PageSeoLookup> => {
  const notFound: PageSeoLookup = {
    kind: 'not_found',
    seo: { ...PROFILE_NOT_FOUND_PAGE_TEXT, robots: 'noindex, nofollow' },
  };
  if (!username.trim()) return notFound;

  try {
    const origin = await getRequestOrigin();
    const response = await withEdgeCache(
      new Request(origin),
      `${CACHE_KEY_PREFIX}${encodeURIComponent(username)}`,
      CACHE_TTL_SECONDS,
      async () => {
        const result = await loadUserProfile(username, { apiClient: profileApi });
        if (result.kind !== 'ok') {
          return new Response(null, { status: result.kind === 'not_found' ? 404 : 503 });
        }
        return Response.json({
          title: getProfileDisplayName(result.profile),
          description: buildProfileSummary(result.profile, calculateStats(result.templates)),
          username: result.profile.username,
        });
      },
    );
    if (response.status === 404) return notFound;
    if (!response.ok) return { kind: 'unavailable' };

    const profile = foundProfileSchema.parse(await response.json());
    return {
      kind: 'found',
      seo: {
        title: profile.title,
        description: profile.description,
        path: buildPublicProfilePath(profile.username),
      },
    };
  } catch (error) {
    log('error', 'profile_page_meta_failed', describeErrorForLog(error));
    return { kind: 'unavailable' };
  }
});
