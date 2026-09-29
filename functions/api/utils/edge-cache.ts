// Serves a response from this data center's Cache API for `ttlSeconds`, so repeat
// requests read nothing from D1 (docs/design-docs/d1-cost.md). Use it only for
// responses that are identical for every visitor. The caller names the key (`keyPath`),
// so path and query-string variants of the same resource cannot bypass the cache.
export async function withEdgeCache(
  request: Request,
  keyPath: string,
  ttlSeconds: number,
  build: () => Promise<Response>,
): Promise<Response> {
  const cache = typeof caches === 'undefined' ? undefined : caches.default;
  if (!cache || request.method !== 'GET') return build();

  const key = new Request(`${new URL(request.url).origin}${keyPath}`);
  const cached = await cache.match(key);
  if (cached) {
    // Copy so callers can set headers, and drop the directive that only the cache needs.
    const hit = new Response(cached.body, cached);
    hit.headers.delete('Cache-Control');
    return hit;
  }

  const response = await build();
  if (response.ok) {
    const stored = new Response(response.clone().body, response);
    stored.headers.set('Cache-Control', `public, s-maxage=${ttlSeconds}`);
    await cache.put(key, stored);
  }
  return response;
}
