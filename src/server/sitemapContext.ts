import 'server-only';

import { getCloudflareContext } from '@opennextjs/cloudflare';

import type { Env } from '@functions/api/types';
import type { SitemapContext } from '@functions/sitemap/cache';

/** What a sitemap needs from the Worker: its bindings and waitUntil for the cache write. */
export async function getSitemapContext(request: Request): Promise<SitemapContext> {
  const { env, ctx } = await getCloudflareContext({ async: true });
  return {
    request,
    env: env as unknown as Env,
    waitUntil: (promise) => ctx.waitUntil(promise),
  };
}
