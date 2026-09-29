import { getCloudflareContext } from '@opennextjs/cloudflare';

import api from '@functions/api/[[route]]';
import type { Env } from '@functions/api/types';

// Every /api/* request goes to the API router in functions/api, unchanged: the same code the
// Pages Functions ran, now in the Next.js Worker on the pages' own origin. The router answers
// every method, including HEAD and OPTIONS (CORS preflight for agents and other origins).
async function handle(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  return api.fetch(request, env as unknown as Env);
}

export { handle as DELETE, handle as GET, handle as HEAD, handle as OPTIONS, handle as PATCH, handle as POST, handle as PUT };
