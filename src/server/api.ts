import 'server-only';

import api from '@functions/api/[[route]]';
import { ApiError } from '@/lib/api-errors';

import { getRequestOrigin, getWorkerEnv } from './cloudflare';

export async function fetchApi(path: string): Promise<Response> {
  const [env, origin] = await Promise.all([getWorkerEnv(), getRequestOrigin()]);
  return api.fetch(new Request(new URL(path, origin)), env);
}

export async function fetchApiJson(path: string): Promise<unknown> {
  const response = await fetchApi(path);
  if (!response.ok) {
    throw new ApiError({ status: response.status, message: `GET ${new URL(path, 'http://api').pathname} failed` });
  }
  return response.json();
}
