import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { connection } from 'next/server';

import type { Env } from '@functions/api/types';
import type { SitemapContext } from '@functions/sitemap/cache';

export async function getSitemapContext(request: Request): Promise<SitemapContext> {
  await connection();
  const { env, ctx } = await getCloudflareContext({ async: true });
  return {
    request,
    env: env as unknown as Env,
    waitUntil: (promise) => ctx.waitUntil(promise),
  };
}
