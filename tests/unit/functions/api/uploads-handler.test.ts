import { describe, it, expect, vi } from 'vitest';
import { handleUploads } from '@functions/api/handlers/uploads';
import { AVATAR_MIME_TYPES } from '@/lib/schemas/uploadTypes';
import { UPLOAD_MAX_BYTES, type UploadBucket } from '@/lib/schemas/uploadLimits';

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

import { getSessionUserId } from '@functions/api/utils/session';

describe('Uploads Handler', () => {
  it('rejects disallowed MIME types for avatars bucket', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');

    const form = new FormData();
    form.set('bucket', 'avatars');
    form.set('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }));

    const request = new Request('http://localhost/api/uploads', {
      method: 'POST',
      body: form,
    });

    const env: any = {
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      R2_UPLOADS: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    };

    const response = await handleUploads(request, env);
    const data = await response.json();

    expect(response.status).toBe(415);
    expect(data.code).toBe('unsupported_file_type');
    expect(data.error).toBe("This file type can't be uploaded here. Use PNG, JPEG, WebP, or GIF images.");
    expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
  });
});

describe('Uploads Handler file types', () => {
  const buildEnv = (): any => ({
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    R2_UPLOADS: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
  });

  const upload = (bucket: string, file: File): Request => {
    const form = new FormData();
    form.set('bucket', bucket);
    form.set('file', file);
    return new Request('http://localhost/api/uploads', { method: 'POST', body: form });
  };

  // The same browser-reported cases as the shared list's test, through the handler.
  it.each([
    ['template-files', 'report.zip', 'application/x-zip-compressed', 'application/x-zip-compressed'],
    ['template-files', 'data.csv', 'text/csv', 'text/csv'],
    ['template-files', 'data.csv', 'application/vnd.ms-excel', 'application/vnd.ms-excel'],
    ['template-files', 'letter.doc', 'application/msword', 'application/msword'],
    ['template-files', 'shot.png', 'image/png', 'image/png'],
    ['template-files', 'notes.md', 'application/octet-stream', 'text/markdown'],
  ])('stores %s %s sent as %s', async (bucket, name, type, stored) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = buildEnv();

    const response = await handleUploads(upload(bucket, new File(['x'], name, { type })), env);

    expect(response.status).toBe(200);
    expect(env.R2_UPLOADS.put).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${bucket}/user-123/`)),
      expect.anything(),
      expect.objectContaining({ httpMetadata: expect.objectContaining({ contentType: stored }) }),
    );
  });

  it.each([
    ['template-images', 'page.html', 'text/html'],
    ['template-images', 'x.svg', 'image/svg+xml'],
    ['template-files', 'x.svg', 'image/svg+xml'],
    ['template-files', 'mystery', ''],
    ['template-videos', 'movie.mkv', 'video/x-matroska'],
  ])('refuses %s %s sent as "%s"', async (bucket, name, type) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = buildEnv();

    const response = await handleUploads(upload(bucket, new File(['x'], name, { type })), env);

    expect(response.status).toBe(415);
    expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
  });

  it('tells browsers not to guess the type of a stored file', async () => {
    const env = buildEnv();
    env.R2_UPLOADS.get.mockResolvedValue({
      body: 'x',
      httpEtag: '"etag"',
      writeHttpMetadata: (headers: Headers) => headers.set('content-type', 'image/png'),
    });

    const response = await handleUploads(
      new Request('http://localhost/api/uploads/file?key=template-images/u/a.png'),
      env,
    );

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('Uploads Handler DELETE', () => {
  function deleteRequest(key: string): Request {
    return new Request(
      `http://localhost/api/uploads/file?key=${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    );
  }

  function buildEnv(): any {
    return {
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      R2_UPLOADS: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    };
  }

  it.each(['template-images', 'template-videos', 'template-files'])(
    'refuses to delete the caller\'s own %s upload because templates, runs, and copies share it',
    async (bucket) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      const env = buildEnv();

      const response = await handleUploads(
        deleteRequest(`${bucket}/user-123/asset.bin`),
        env,
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'asset_referenced' });
      expect(env.R2_UPLOADS.delete).not.toHaveBeenCalled();
    },
  );

  it('deletes the caller\'s own avatar', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = buildEnv();

    const response = await handleUploads(deleteRequest('avatars/user-123/a.png'), env);

    expect(response.status).toBe(200);
    expect(env.R2_UPLOADS.delete).toHaveBeenCalledWith('avatars/user-123/a.png');
  });

  it.each([
    'avatars/user-999/a.png',
    'other-bucket/user-123/a.png',
    'avatars/evil/user-123/a.png',
    'template-images/evil/user-123/a.png',
  ])('rejects deleting %s', async (key) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = buildEnv();

    const response = await handleUploads(deleteRequest(key), env);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(env.R2_UPLOADS.delete).not.toHaveBeenCalled();
  });
});

describe('Uploads Handler avatar types', () => {
  function uploadRequest(file: File): Request {
    const form = new FormData();
    form.set('bucket', 'avatars');
    form.set('file', file);
    return new Request('http://localhost/api/uploads', { method: 'POST', body: form });
  }

  it.each([...AVATAR_MIME_TYPES])('stores %s avatars, which the avatar picker offers', async (type) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env: any = {
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      R2_UPLOADS: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    };

    const response = await handleUploads(uploadRequest(new File(['x'], 'a', { type })), env);

    expect(response.status).toBe(200);
  });

  it('refuses SVG avatars, which the avatar picker does not offer', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env: any = {
      BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
      R2_UPLOADS: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    };

    const response = await handleUploads(
      uploadRequest(new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })),
      env,
    );

    expect(response.status).toBe(415);
    expect(AVATAR_MIME_TYPES).not.toContain('image/svg+xml');
  });
});

const MB = 1024 * 1024;

function uploadRequest(bucket: string, file: File) {
  const form = new FormData();
  form.set('bucket', bucket);
  form.set('file', file);
  return new Request('http://localhost/api/uploads', { method: 'POST', body: form });
}

/** Hands the handler the parsed form as-is, so a file keeps an empty content type. */
function rawFormUpload(bucket: string, file: File) {
  const form = new FormData();
  form.set('bucket', bucket);
  form.set('file', file);
  return {
    method: 'POST',
    url: 'http://localhost/api/uploads',
    headers: new Headers(),
    formData: async () => form,
  } as unknown as Request;
}

function uploadEnv() {
  return {
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!',
    R2_UPLOADS: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
  } as any;
}

describe('Uploads Handler size and type limits', () => {
  it('rejects an avatar over 5MB without storing it', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();

    const response = await handleUploads(
      uploadRequest('avatars', new File([new Uint8Array(5 * MB + 1)], 'me.png', { type: 'image/png' })),
      env,
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: 'File too large (max 5MB)' });
    expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
  });

  it('accepts a 5MB avatar and a 6MB Template image', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();

    const avatar = await handleUploads(
      uploadRequest('avatars', new File([new Uint8Array(5 * MB)], 'me.png', { type: 'image/png' })),
      env,
    );
    const image = await handleUploads(
      uploadRequest('template-images', new File([new Uint8Array(6 * MB)], 'step.png', { type: 'image/png' })),
      env,
    );

    expect(avatar.status).toBe(200);
    expect(image.status).toBe(200);
    expect(env.R2_UPLOADS.put).toHaveBeenCalledTimes(2);
  });

  it.each(Object.entries(UPLOAD_MAX_BYTES) as Array<[UploadBucket, number]>)(
    'rejects a %s upload one byte over its %d-byte limit before storing it',
    async (bucket, limit) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      const env = uploadEnv();
      // Reports the size without allocating it; the handler rejects before reading.
      class OversizedFile extends File {
        get size() {
          return limit + 1;
        }
      }

      const response = await handleUploads(rawFormUpload(bucket, new OversizedFile(['x'], 'big.bin')), env);

      expect(response.status).toBe(413);
      expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['avatars', 'page.html'],
    ['avatars', 'no-extension'],
    ['template-images', 'script.js'],
    ['template-files', 'installer.exe'],
  ])('rejects a %s upload named %s that has no content type', async (bucket, name) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();
    const file = new File(['<html></html>'], name);
    expect(file.type).toBe('');

    const response = await handleUploads(rawFormUpload(bucket, file), env);

    expect(response.status).toBe(415);
    expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
  });

  it.each([
    ['no content type', rawFormUpload],
    ['the generic binary type browsers send for unknown files', uploadRequest],
  ])('stores a file with %s under the type its extension allows', async (_label, build) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();

    const response = await handleUploads(build('template-files', new File(['# Notes'], 'notes.md')), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contentType: 'text/markdown' });
    expect(env.R2_UPLOADS.put).toHaveBeenCalledWith(
      expect.stringMatching(/^template-files\/user-123\/.+\.md$/),
      expect.anything(),
      expect.objectContaining({ httpMetadata: expect.objectContaining({ contentType: 'text/markdown' }) }),
    );
  });
});

describe('Uploads Handler storage', () => {
  // formData() already holds the file; copying it into an ArrayBuffer would hold
  // a 50MB upload twice, close to the isolate's 128MB memory limit.
  it('streams the parsed file to R2 without copying it into a second buffer', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();
    const file = new File([new Uint8Array(1024)], 'clip.mp4', { type: 'video/mp4' });
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

    const response = await handleUploads(rawFormUpload('template-videos', file), env);

    expect(response.status).toBe(200);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(env.R2_UPLOADS.put).toHaveBeenCalledWith(
      expect.stringMatching(/^template-videos\/user-123\/.+\.mp4$/),
      file,
      expect.objectContaining({ httpMetadata: expect.objectContaining({ contentType: 'video/mp4' }) }),
    );
  });
});

const FILE_KEY = 'template-videos/user-123/clip.mp4';
const FILE_SIZE = 100;
const FILE_ETAG = '"etag-1"';

// Models R2: a parsed range selects bytes, an offset past the end throws, and a
// failed precondition returns the object's metadata without a body.
function fakeR2Bucket() {
  const bytes = Uint8Array.from({ length: FILE_SIZE }, (_, index) => index);
  const metadata = () => ({
    key: FILE_KEY,
    size: FILE_SIZE,
    etag: 'etag-1',
    httpEtag: FILE_ETAG,
    writeHttpMetadata: (headers: Headers) => headers.set('Content-Type', 'video/mp4'),
  });
  return {
    put: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(async (key: string) => (key === FILE_KEY ? metadata() : null)),
    get: vi.fn(async (key: string, options?: { range?: any; onlyIf?: Headers }) => {
      if (key !== FILE_KEY) return null;
      if (options?.onlyIf instanceof Headers && options.onlyIf.get('If-None-Match') === FILE_ETAG) {
        return metadata();
      }
      const range = options?.range;
      if (range instanceof Headers) throw new Error('fake bucket expects a parsed range');
      let slice = bytes;
      if (range) {
        const start = 'suffix' in range ? Math.max(0, FILE_SIZE - range.suffix) : range.offset ?? 0;
        if (start >= FILE_SIZE) throw new Error('get: The requested range is not satisfiable (10039)');
        const end = 'suffix' in range || range.length === undefined ? FILE_SIZE : Math.min(FILE_SIZE, start + range.length);
        slice = bytes.slice(start, end);
      }
      return { ...metadata(), range, body: new Blob([slice]).stream() };
    }),
  };
}

function fileRequest(headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`http://localhost/api/uploads/file?key=${encodeURIComponent(FILE_KEY)}`, { method, headers });
}

async function bodyBytes(response: Response) {
  return Array.from(new Uint8Array(await response.arrayBuffer()));
}

describe('Uploads Handler file downloads', () => {
  it('serves the whole file with range support advertised', async () => {
    const bucket = fakeR2Bucket();
    const response = await handleUploads(fileRequest(), { R2_UPLOADS: bucket } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Length')).toBe(String(FILE_SIZE));
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(response.headers.get('etag')).toBe(FILE_ETAG);
    expect(await bodyBytes(response)).toHaveLength(FILE_SIZE);
  });

  it('answers the Safari byte-range probe with 206 and only the requested bytes', async () => {
    const bucket = fakeR2Bucket();
    const response = await handleUploads(fileRequest({ Range: 'bytes=0-1' }), { R2_UPLOADS: bucket } as any);

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(`bytes 0-1/${FILE_SIZE}`);
    expect(response.headers.get('Content-Length')).toBe('2');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(await bodyBytes(response)).toEqual([0, 1]);
    expect(bucket.get).toHaveBeenCalledWith(
      FILE_KEY,
      expect.objectContaining({ range: { offset: 0, length: 2 } }),
    );
  });

  it.each([
    ['bytes=95-', 'bytes 95-99/100', [95, 96, 97, 98, 99]],
    ['bytes=-3', 'bytes 97-99/100', [97, 98, 99]],
    ['bytes=98-500', 'bytes 98-99/100', [98, 99]],
  ])('serves %s as %s', async (range, contentRange, expected) => {
    const response = await handleUploads(fileRequest({ Range: range }), { R2_UPLOADS: fakeR2Bucket() } as any);

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(contentRange);
    expect(response.headers.get('Content-Length')).toBe(String(expected.length));
    expect(await bodyBytes(response)).toEqual(expected);
  });

  it.each(['bytes=100-', 'bytes=-0'])('rejects the unsatisfiable range %s with 416', async (range) => {
    const response = await handleUploads(fileRequest({ Range: range }), { R2_UPLOADS: fakeR2Bucket() } as any);

    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe(`bytes */${FILE_SIZE}`);
  });

  it.each(['bytes=0-1,4-5', 'bytes=5-2', 'items=0-1', 'bytes=abc'])(
    'ignores the unsupported or invalid range %s and serves the whole file',
    async (range) => {
      const response = await handleUploads(fileRequest({ Range: range }), { R2_UPLOADS: fakeR2Bucket() } as any);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Range')).toBeNull();
      expect(await bodyBytes(response)).toHaveLength(FILE_SIZE);
    },
  );

  it('serves the whole file when If-Range no longer matches', async () => {
    const bucket = fakeR2Bucket();
    const response = await handleUploads(
      fileRequest({ Range: 'bytes=0-1', 'If-Range': '"stale-etag"' }),
      { R2_UPLOADS: bucket } as any,
    );

    expect(response.status).toBe(200);
    expect(await bodyBytes(response)).toHaveLength(FILE_SIZE);
  });

  it('answers a matching If-None-Match with 304 and no body', async () => {
    const response = await handleUploads(
      fileRequest({ 'If-None-Match': FILE_ETAG }),
      { R2_UPLOADS: fakeR2Bucket() } as any,
    );

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(FILE_ETAG);
    expect(response.body).toBeNull();
  });

  it('answers HEAD from metadata without reading the object', async () => {
    const bucket = fakeR2Bucket();
    const response = await handleUploads(fileRequest({}, 'HEAD'), { R2_UPLOADS: bucket } as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Length')).toBe(String(FILE_SIZE));
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing file, with or without a range', async () => {
    const bucket = fakeR2Bucket();
    const missing = new Request('http://localhost/api/uploads/file?key=missing', { headers: { Range: 'bytes=0-1' } });

    expect((await handleUploads(missing, { R2_UPLOADS: bucket } as any)).status).toBe(404);
  });
});

describe('Uploads Handler delete authorization', () => {
  const SELF = 'user-123';
  const OTHER = 'user-456';

  function deleteRequest(key: string) {
    return new Request(`http://localhost/api/uploads/file?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  }

  it('lets an account delete its own avatar', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(SELF);
    const env = uploadEnv();

    const response = await handleUploads(deleteRequest(`avatars/${SELF}/a.png`), env);

    expect(response.status).toBe(200);
    expect(env.R2_UPLOADS.delete).toHaveBeenCalledWith(`avatars/${SELF}/a.png`);
  });

  // Template media is referenced by Templates (Personal and Organization),
  // versions, Runs and public-template clones, and uploads record no owner, so
  // the uploader, including a disabled or removed Organization member, must not
  // be able to delete it.
  it.each(['template-files', 'template-images', 'template-videos'])(
    'refuses to delete %s, even for the account that uploaded it',
    async (bucket) => {
      vi.mocked(getSessionUserId).mockResolvedValue(SELF);
      const env = uploadEnv();

      const response = await handleUploads(deleteRequest(`${bucket}/${SELF}/doc.pdf`), env);

      expect(response.status).toBe(403);
      expect(env.R2_UPLOADS.delete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['another account avatar', `avatars/${OTHER}/a.png`],
    ['a key with the caller id smuggled in', `template-files/${OTHER}/a.pdf/${SELF}/x`],
    ['an extra path segment', `avatars/${SELF}/nested/a.png`],
    ['an unknown bucket', `x/${SELF}/y`],
    ['a key with no file name', `avatars/${SELF}/`],
    ['a key with no bucket', `${SELF}/a.png`],
  ])('refuses to delete %s', async (_label, key) => {
    vi.mocked(getSessionUserId).mockResolvedValue(SELF);
    const env = uploadEnv();

    const response = await handleUploads(deleteRequest(key), env);

    expect(response.status).toBe(403);
    expect(env.R2_UPLOADS.delete).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    const env = uploadEnv();

    const response = await handleUploads(deleteRequest(`avatars/${SELF}/a.png`), env);

    expect(response.status).toBe(401);
    expect(env.R2_UPLOADS.delete).not.toHaveBeenCalled();
  });
});
