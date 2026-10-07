import { getCloudflareContext } from '@opennextjs/cloudflare';

import api from '@functions/api/[[route]]';

const toApiRequest = (request: Request): Request =>
  new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? null : request.body,
    redirect: request.redirect,
    signal: request.signal,
    duplex: 'half',
  } as RequestInit);

async function handle(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true });
  return api.fetch(toApiRequest(request), env);
}

export { handle as DELETE, handle as GET, handle as HEAD, handle as OPTIONS, handle as PATCH, handle as POST, handle as PUT };
