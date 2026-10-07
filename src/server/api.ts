import 'server-only';

import type { z } from 'zod';

import api from '@functions/api/[[route]]';
import { ApiError, UNREADABLE_RESPONSE_CODE, UNREADABLE_RESPONSE_MESSAGE } from '@/lib/api-errors';

import { getRequestOrigin, getWorkerEnv } from './cloudflare';

export async function fetchApi(path: string): Promise<Response> {
  const [env, origin] = await Promise.all([getWorkerEnv(), getRequestOrigin()]);
  return api.fetch(new Request(new URL(path, origin)), env);
}

export async function fetchApiJson<Output>(path: string, schema: z.ZodType<Output, z.ZodTypeDef, unknown>): Promise<Output> {
  const response = await fetchApi(path);
  if (!response.ok) {
    throw new ApiError({ status: response.status, message: `GET ${new URL(path, 'http://api').pathname} failed` });
  }
  const body: unknown = await response.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      status: response.status,
      message: UNREADABLE_RESPONSE_MESSAGE,
      code: UNREADABLE_RESPONSE_CODE,
      details: { issues: parsed.error.issues },
      cause: parsed.error,
    });
  }
  return parsed.data;
}
