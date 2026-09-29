import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { headers } from 'next/headers';

import type { Env } from '@functions/api/types';

/** The Worker's bindings (D1, R2, vars and secrets), typed as the API's Env. */
export async function getWorkerEnv(): Promise<Env> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as Env;
}

/** Keeps a promise running after the response is sent (an edge cache write). */
export async function getWaitUntil(): Promise<(promise: Promise<unknown>) => void> {
  const { ctx } = await getCloudflareContext({ async: true });
  return (promise) => ctx.waitUntil(promise);
}

/**
 * The origin this request was sent to. Edge cache keys start with it, so staging and
 * production, which share the serplists.com zone and its cache, never read each other's
 * entries. Reading headers makes the page render on each request.
 */
export async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost';
  const protocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'http' ? 'http' : 'https';
  return `${protocol}://${host}`;
}
