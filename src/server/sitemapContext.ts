import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';
import { connection } from 'next/server';

import type { SitemapContext } from '@functions/sitemap/cache';

export async function getSitemapContext(request: Request): Promise<SitemapContext> {
  await connection();
  const { env, ctx } = await getCloudflareContext({ async: true });
  return {
    request,
    env,
    waitUntil: (promise) => ctx.waitUntil(promise),
  };
}
