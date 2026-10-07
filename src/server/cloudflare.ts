import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { headers } from 'next/headers';

import type { Env } from '@functions/api/types';

export async function getWorkerEnv(): Promise<Env> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

export async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') ?? 'localhost';
  const protocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim() === 'http' ? 'http' : 'https';
  return `${protocol}://${host}`;
}
