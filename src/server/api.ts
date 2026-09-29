import 'server-only';

import api from '@functions/api/[[route]]';
import { ApiError } from '@/lib/api-errors';

import { getRequestOrigin, getWorkerEnv } from './cloudflare';

/**
 * Sends a GET to the API router in this Worker, as a visitor with no session would: the
 * same handlers, visibility rules and edge caches the browser's request gets, without a
 * network hop. For server-rendered pages that need what the API already serves.
 */
export async function fetchApi(path: string): Promise<Response> {
  const [env, origin] = await Promise.all([getWorkerEnv(), getRequestOrigin()]);
  return api.fetch(new Request(new URL(path, origin)), env);
}

/** The JSON body of an API GET; a failed response throws an ApiError, as the app's client does. */
export async function fetchApiJson(path: string): Promise<unknown> {
  const response = await fetchApi(path);
  if (!response.ok) {
    throw new ApiError({ status: response.status, message: `GET ${new URL(path, 'http://api').pathname} failed` });
  }
  return response.json();
}
