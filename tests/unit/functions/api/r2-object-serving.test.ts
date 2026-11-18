import { describe, expect, it } from 'vitest';
import { serveR2Object } from '@functions/api/utils/r2-file-response';
import { InMemoryR2Bucket } from '../../../support/r2Bucket';

const KEY = 'avatars/user-1.png';
const CACHE = 'public, max-age=60';
const file = { key: KEY, bytes: new TextEncoder().encode('0123456789'), contentType: 'image/png', etag: 'etag-1' };

class R2ThatFailsRangedReads extends InMemoryR2Bucket {
  override get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  override get(key: string, options: R2GetOptions & { onlyIf: R2Conditional | Headers }): Promise<R2ObjectBody | R2Object | null>;
  override async get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null> {
    if (options?.range) throw new Error('R2 is unavailable');
    return super.get(key, options);
  }
}

class R2WhosePreconditionFails extends InMemoryR2Bucket {
  override get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
  override get(key: string, options: R2GetOptions & { onlyIf: R2Conditional | Headers }): Promise<R2ObjectBody | R2Object | null>;
  override async get(key: string): Promise<R2ObjectBody | R2Object | null> {
    return this.head(key);
  }
}

const get = (headers: Record<string, string>) => new Request(`https://serplists.com/api/uploads/${KEY}`, { headers });

describe('serveR2Object', () => {
  it('answers a range of a file deleted since the request as not found', async () => {
    const response = await serveR2Object(get({ Range: 'bytes=-0' }), new InMemoryR2Bucket(), KEY, CACHE);

    expect(response.status).toBe(404);
  });

  it('serves the whole file for a suffix range too long to be a number', async () => {
    const response = await serveR2Object(get({ Range: 'bytes=-99999999999999999999' }), new InMemoryR2Bucket([file]), KEY, CACHE);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('0123456789');
  });

  it('passes on a ranged read that fails for any reason but the range', async () => {
    await expect(serveR2Object(get({ Range: 'bytes=0-3' }), new R2ThatFailsRangedReads([file]), KEY, CACHE)).rejects.toThrow('R2 is unavailable');
  });

  it.each([
    ['a cache revalidation by date', 304, { 'If-Modified-Since': 'Thu, 01 Jan 2026 00:00:00 GMT' }],
    ['an If-Match for another version', 412, { 'If-Match': '"etag-0"' }],
  ])('answers %s that R2 does not meet with %i and no body', async (_label, status, headers) => {
    const response = await serveR2Object(get(headers), new R2WhosePreconditionFails([file]), KEY, CACHE);

    expect(response.status).toBe(status);
    expect(response.headers.get('etag')).toBe('"etag-1"');
    expect(await response.text()).toBe('');
  });
});
