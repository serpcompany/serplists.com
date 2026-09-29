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
import { buildPublicProfilePath } from '@/lib/routes';
import type { PageSeo } from '@/lib/seo/pageMetadata';

import { fetchApiJson } from '../api';
import { getRequestOrigin } from '../cloudflare';

// A found profile's tags are cached in the data center for 5 minutes, like the template
// page's, so a busy profile reads D1 once per 5 minutes per data center. A new name or a new
// public template can take that long to reach the title and description; the page itself
// always loads the profile from the API.
const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_KEY_PREFIX = '/__page-meta/v1/profiles/';

const foundProfileSchema = z.object({
  title: z.string(),
  description: z.string(),
  username: z.string(),
});

// The same two requests the page makes (src/features/profile/loadUserProfile.ts), sent to
// the API router in this Worker.
const profileApi: UserProfileApiClient = {
  getProfileByUsername: (username: string) =>
    fetchApiJson(`/api/profiles/by-username?username=${encodeURIComponent(username)}`),
  getPublicTemplatesForUser: (userId: string) =>
    fetchApiJson(`/api/templates/public?userId=${encodeURIComponent(userId)}`),
};

// found: the page's tags. not_found: a settled answer, so the page is kept out of search.
// unavailable: the lookup failed, which may be brief, so the page keeps the site's defaults.
export type ProfilePageSeo =
  | { kind: 'found'; seo: PageSeo }
  | { kind: 'not_found'; seo: PageSeo }
  | { kind: 'unavailable' };

/**
 * What /profile/<username> says in its <head>: the name and summary the page shows, found the
 * way the page finds them. The canonical URL uses the stored username, the one the page moves
 * other letter cases to.
 */
export const loadProfilePageSeo = cache(async (username: string): Promise<ProfilePageSeo> => {
  // No canonical URL: the address is not a page.
  const notFound: ProfilePageSeo = {
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
