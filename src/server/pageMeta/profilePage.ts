import 'server-only';

import { cache } from 'react';
import { z } from 'zod';

import { describeErrorForLog, log } from '@functions/api/utils/logger';
import { withEdgeCache } from '@functions/api/utils/edge-cache';
import {
  foundProfileHandle,
  loadPublicProfile,
  type PublicProfileApiClient,
} from '@/features/profile/loadPublicProfile';
import { calculateStats, describePublicProfile } from '@/features/profile/profileSummary';
import { PROFILE_NOT_FOUND_PAGE_TEXT } from '@/lib/publicPageMeta';
import { apiTemplateListSchema } from '@/lib/schemas/apiTemplates';
import { publicProfileBodySchema } from '@/lib/schemas/publicProfiles';
import { buildPublicProfilePath } from '@/lib/routes';

import { fetchApiJson } from '../api';
import { getRequestOrigin } from '../cloudflare';
import type { PageSeoLookup } from './pageSeoLookup';

const CACHE_TTL_SECONDS = 5 * 60;
const CACHE_KEY_PREFIX = '/__page-meta/v2/profiles/';

const foundProfileSchema = z.object({
  title: z.string(),
  description: z.string(),
  handle: z.string(),
});

const profileApi: PublicProfileApiClient = {
  getPublicProfileByHandle: (handle: string) =>
    fetchApiJson(`/api/profiles/by-handle?handle=${encodeURIComponent(handle)}`, publicProfileBodySchema),
  getPublicTemplatesForUser: (userId: string) =>
    fetchApiJson(`/api/templates/public?userId=${encodeURIComponent(userId)}`, apiTemplateListSchema),
  getPublicTemplatesForOrganization: (handle: string) =>
    fetchApiJson(`/api/templates/public?handle=${encodeURIComponent(handle)}`, apiTemplateListSchema),
};

export const loadProfilePageSeo = cache(async (handle: string): Promise<PageSeoLookup> => {
  const notFound: PageSeoLookup = {
    kind: 'not_found',
    seo: { ...PROFILE_NOT_FOUND_PAGE_TEXT, robots: 'noindex, nofollow' },
  };
  if (!handle.trim()) return notFound;

  try {
    const origin = await getRequestOrigin();
    const response = await withEdgeCache(
      new Request(origin),
      `${CACHE_KEY_PREFIX}${encodeURIComponent(handle)}`,
      CACHE_TTL_SECONDS,
      async () => {
        const result = await loadPublicProfile(handle, { apiClient: profileApi });
        if (result.kind === 'not_found' || result.kind === 'error') {
          return new Response(null, { status: result.kind === 'not_found' ? 404 : 503 });
        }
        const { title, summary } = describePublicProfile(result, calculateStats(result.templates));
        return Response.json({ title, description: summary, handle: foundProfileHandle(result) });
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
        path: buildPublicProfilePath(profile.handle),
      },
    };
  } catch (error) {
    log('error', 'profile_page_meta_failed', describeErrorForLog(error));
    return { kind: 'unavailable' };
  }
});
