type WorkersCacheStorage = CacheStorage & { default?: Cache };

export function defaultEdgeCache(): Cache | undefined {
  if (typeof caches === 'undefined') return undefined;
  return (caches as WorkersCacheStorage).default;
}

function mutableCopyWithoutCacheControl(cached: Response): Response {
  const hit = new Response(cached.body, cached);
  hit.headers.delete('Cache-Control');
  return hit;
}

export async function withEdgeCache(
  request: Request,
  keyPath: string,
  ttlSeconds: number,
  build: () => Promise<Response>,
): Promise<Response> {
  const cache = defaultEdgeCache();
  if (!cache || request.method !== 'GET') return build();

  const key = new Request(`${new URL(request.url).origin}${keyPath}`);
  const cached = await cache.match(key);
  if (cached) return mutableCopyWithoutCacheControl(cached);

  const response = await build();
  if (response.ok) {
    const stored = new Response(response.clone().body, response);
    stored.headers.set('Cache-Control', `public, s-maxage=${ttlSeconds}`);
    await cache.put(key, stored);
  }
  return response;
}
