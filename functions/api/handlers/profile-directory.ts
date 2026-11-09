import type { Env } from '../types';
import { withEdgeCache } from '../utils/edge-cache';
import { loadProfileDirectoryPage } from '../utils/profile-directory';
import { invalidPayloadResponse } from '../utils/request-json';
import { json, jsonError } from '../utils/response';
import {
  parseProfileDirectoryQuery,
  profileDirectorySearchParams,
  type ProfileDirectoryQuery,
} from '../../../src/lib/schemas/profileDirectory';

const PROFILE_DIRECTORY_CACHE_SECONDS = 5 * 60;

const PROFILE_DIRECTORY_CACHE_SHAPE = 'handle-name-avatar-public-template-count';

function cacheKeyPath(query: ProfileDirectoryQuery): string {
  const key = profileDirectorySearchParams(query);
  key.set('fields', PROFILE_DIRECTORY_CACHE_SHAPE);
  return `/api/profiles?${key.toString()}`;
}

export async function handleProfileDirectory(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return jsonError('Method Not Allowed', 405);

  const parsed = parseProfileDirectoryQuery(new URL(request.url).searchParams);
  if (!parsed.success) return invalidPayloadResponse(parsed.error, 'Invalid profile directory query');

  const query = parsed.data;
  return withEdgeCache(request, cacheKeyPath(query), PROFILE_DIRECTORY_CACHE_SECONDS, async () =>
    json(await loadProfileDirectoryPage(env, query)),
  );
}
