import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withEdgeCache } from '../../../../functions/api/utils/edge-cache';

let store: Map<string, Response>;

describe('withEdgeCache', () => {
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal('caches', {
      default: {
        match: async (key: Request) => store.get(key.url)?.clone(),
        put: async (key: Request, response: Response) => { store.set(key.url, response); },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const build = () => vi.fn(async () => new Response('[1]', { headers: { 'Content-Type': 'application/json' } }));

  it('builds once, then serves the cached body with mutable headers', async () => {
    const handler = build();
    const first = await withEdgeCache(new Request('https://serplists.com/api/templates'), 300, handler);
    const second = await withEdgeCache(new Request('https://serplists.com/api/templates?x=1'), 300, handler);

    expect(handler).toHaveBeenCalledOnce();
    expect(await first.text()).toBe('[1]');
    expect(await second.text()).toBe('[1]');
    expect(second.headers.get('content-type')).toBe('application/json');
    expect(second.headers.get('cache-control')).toBeNull();
    second.headers.set('X-Request-Id', 'abc');
    expect(store.get('https://serplists.com/api/templates')?.headers.get('cache-control')).toBe('public, s-maxage=300');
  });

  it('does not cache errors or non-GET requests', async () => {
    const failing = vi.fn(async () => new Response('no', { status: 500 }));
    await withEdgeCache(new Request('https://serplists.com/api/templates'), 300, failing);
    await withEdgeCache(new Request('https://serplists.com/api/templates'), 300, failing);
    expect(failing).toHaveBeenCalledTimes(2);

    const handler = build();
    await withEdgeCache(new Request('https://serplists.com/api/templates', { method: 'POST' }), 300, handler);
    expect(store.size).toBe(0);
  });
});
