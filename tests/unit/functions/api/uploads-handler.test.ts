import { describe, it, expect, vi } from 'vitest';
import { handleUploads } from '@functions/api/handlers/uploads';
import { AVATAR_MIME_TYPES, UPLOAD_BUCKETS } from '@/lib/schemas/uploadTypes';
import { UPLOAD_MAX_BYTES, type UploadBucket } from '@/lib/schemas/uploadLimits';

vi.mock('@functions/api/utils/session', () => ({
  getSessionUserId: vi.fn(),
}));

import { getSessionUserId } from '@functions/api/utils/session';
import { apiEnv } from '../../../support/apiEnv';
import { anything, objectContaining, stringMatching } from '../../../support/asymmetricMatchers';
import { InMemoryR2Bucket, type R2File } from '../../../support/r2Bucket';
import { apiErrorBody, readJson } from '../../../support/readJson';

const MB = 1024 * 1024;

function uploadEnv(files: R2File[] = []) {
  const bucket = new InMemoryR2Bucket(files);
  vi.spyOn(bucket, 'put');
  vi.spyOn(bucket, 'delete');
  return apiEnv({ BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-minimum!!', R2_UPLOADS: bucket });
}

function uploadForm(bucket: string, file: File) {
  const form = new FormData();
  form.set('bucket', bucket);
  form.set('file', file);
  return form;
}

function uploadRequest(bucket: string, file: File) {
  return new Request('http://localhost/api/uploads', { method: 'POST', body: uploadForm(bucket, file) });
}

class UploadOfTheFormAsIs extends Request {
  constructor(private readonly form: FormData) {
    super('http://localhost/api/uploads', { method: 'POST' });
  }

  override async formData(): Promise<FormData> {
    return this.form;
  }
}

function uploadOfTheFileObjectAsIs(bucket: string, file: File) {
  return new UploadOfTheFormAsIs(uploadForm(bucket, file));
}

function deleteRequest(key: string) {
  return new Request(`http://localhost/api/uploads/file?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
}

describe('Uploads Handler', () => {
  it('rejects disallowed MIME types for avatars bucket', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();

    const response = await handleUploads(uploadRequest('avatars', new File(['hello'], 'hello.txt', { type: 'text/plain' })), env);
    const data = await readJson(response, apiErrorBody);

    expect(response.status).toBe(415);
    expect(data.code).toBe('unsupported_file_type');
    expect(data.error).toBe("This file type can't be uploaded here. Use PNG, JPEG, WebP, or GIF images.");
    expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
  });
});

async function uploadAs(bucket: string, name: string, type: string) {
  vi.mocked(getSessionUserId).mockResolvedValue('user-123');
  const env = uploadEnv();
  const response = await handleUploads(uploadRequest(bucket, new File(['x'], name, { type })), env);
  return { env, response };
}

describe('Uploads Handler file types', () => {
  it.each([
    ['template-files', 'report.zip', 'application/x-zip-compressed', 'application/x-zip-compressed'],
    ['template-files', 'data.csv', 'text/csv', 'text/csv'],
    ['template-files', 'data.csv', 'application/vnd.ms-excel', 'application/vnd.ms-excel'],
    ['template-files', 'letter.doc', 'application/msword', 'application/msword'],
    ['template-files', 'shot.png', 'image/png', 'image/png'],
    ['template-files', 'notes.md', 'application/octet-stream', 'text/markdown'],
  ])('stores %s %s sent as %s, as the shared type list accepts what browsers report', async (bucket, name, type, stored) => {
    const { env, response } = await uploadAs(bucket, name, type);

    expect(response.status).toBe(200);
    expect(env.R2_UPLOADS.put).toHaveBeenCalledWith(
      stringMatching(new RegExp(`^${bucket}/user-123/`)),
      anything(),
      objectContaining({ httpMetadata: objectContaining({ contentType: stored }) }),
    );
  });

  it.each([
    ['template-images', 'page.html', 'text/html'],
    ['template-images', 'x.svg', 'image/svg+xml'],
    ['template-files', 'x.svg', 'image/svg+xml'],
    ['template-files', 'mystery', ''],
    ['template-videos', 'movie.mkv', 'video/x-matroska'],
  ])('refuses %s %s sent as "%s"', async (bucket, name, type) => {
    const { env, response } = await uploadAs(bucket, name, type);

    expect(response.status).toBe(415);
    expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
  });

  it('tells browsers not to guess the type of a stored file', async () => {
    const env = uploadEnv([{ key: 'template-images/u/a.png', bytes: new Uint8Array([1]), contentType: 'image/png', etag: 'etag' }]);

    const response = await handleUploads(
      new Request('http://localhost/api/uploads/file?key=template-images/u/a.png'),
      env,
    );

    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});

describe('Uploads Handler avatar types', () => {
  it.each([...AVATAR_MIME_TYPES])('stores %s avatars, which the avatar picker offers', async (type) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();

    const response = await handleUploads(uploadRequest('avatars', new File(['x'], 'a', { type })), env);

    expect(response.status).toBe(200);
  });

  it('refuses SVG avatars, which the avatar picker does not offer', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();

    const response = await handleUploads(
      uploadRequest('avatars', new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' })),
      env,
    );

    expect(response.status).toBe(415);
    expect(AVATAR_MIME_TYPES).not.toContain('image/svg+xml');
  });
});

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

  it.each(UPLOAD_BUCKETS.map((bucket): [UploadBucket, number] => [bucket, UPLOAD_MAX_BYTES[bucket]]))(
    'rejects a %s upload one byte over its %d-byte limit before reading or storing it',
    async (bucket, limit) => {
      vi.mocked(getSessionUserId).mockResolvedValue('user-123');
      const env = uploadEnv();
      class FileReportingOneByteOverTheLimit extends File {
        override get size() {
          return limit + 1;
        }
      }

      const response = await handleUploads(uploadOfTheFileObjectAsIs(bucket, new FileReportingOneByteOverTheLimit(['x'], 'big.bin')), env);

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

    const response = await handleUploads(uploadOfTheFileObjectAsIs(bucket, file), env);

    expect(response.status).toBe(415);
    expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
  });

  it.each([
    ['no content type', uploadOfTheFileObjectAsIs],
    ['the generic binary type browsers send for unknown files', uploadRequest],
  ])('stores a file with %s under the type its extension allows', async (_label, build) => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();

    const response = await handleUploads(build('template-files', new File(['# Notes'], 'notes.md')), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ contentType: 'text/markdown' });
    expect(env.R2_UPLOADS.put).toHaveBeenCalledWith(
      stringMatching(/^template-files\/user-123\/.+\.md$/),
      anything(),
      objectContaining({ httpMetadata: objectContaining({ contentType: 'text/markdown' }) }),
    );
  });
});

describe('Uploads Handler storage', () => {
  it('streams the parsed file to R2 without a second copy, which would hold a 50MB upload twice near the isolate\'s 128MB memory limit', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue('user-123');
    const env = uploadEnv();
    const file = new File([new Uint8Array(1024)], 'clip.mp4', { type: 'video/mp4' });
    const arrayBuffer = vi.spyOn(file, 'arrayBuffer');

    const response = await handleUploads(uploadOfTheFileObjectAsIs('template-videos', file), env);

    expect(response.status).toBe(200);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(env.R2_UPLOADS.put).toHaveBeenCalledWith(
      stringMatching(/^template-videos\/user-123\/.+\.mp4$/),
      file,
      objectContaining({ httpMetadata: objectContaining({ contentType: 'video/mp4' }) }),
    );
  });
});

const FILE_KEY = 'template-videos/user-123/clip.mp4';
const FILE_SIZE = 100;
const FILE_ETAG = '"etag-1"';

function fakeR2BucketWithRangesAndPreconditions() {
  const bytes = Uint8Array.from({ length: FILE_SIZE }, (_, index) => index);
  const bucket = new InMemoryR2Bucket([{ key: FILE_KEY, bytes, contentType: 'video/mp4', etag: FILE_ETAG.slice(1, -1) }]);
  vi.spyOn(bucket, 'get');
  return bucket;
}

function fileRequest(headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`http://localhost/api/uploads/file?key=${encodeURIComponent(FILE_KEY)}`, { method, headers });
}

function expectTheWholeFileWithRangesAdvertised(response: Response) {
  expect(response.status).toBe(200);
  expect(response.headers.get('Accept-Ranges')).toBe('bytes');
  expect(response.headers.get('Content-Length')).toBe(String(FILE_SIZE));
}

async function bodyBytes(response: Response) {
  return Array.from(new Uint8Array(await response.arrayBuffer()));
}

describe('Uploads Handler file downloads', () => {
  it('serves the whole file with range support advertised', async () => {
    const bucket = fakeR2BucketWithRangesAndPreconditions();
    const response = await handleUploads(fileRequest(), apiEnv({ R2_UPLOADS: bucket }));

    expectTheWholeFileWithRangesAdvertised(response);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(response.headers.get('etag')).toBe(FILE_ETAG);
    expect(await bodyBytes(response)).toHaveLength(FILE_SIZE);
  });

  it('answers the Safari byte-range probe with 206 and only the requested bytes', async () => {
    const bucket = fakeR2BucketWithRangesAndPreconditions();
    const response = await handleUploads(fileRequest({ Range: 'bytes=0-1' }), apiEnv({ R2_UPLOADS: bucket }));

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(`bytes 0-1/${FILE_SIZE}`);
    expect(response.headers.get('Content-Length')).toBe('2');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(await bodyBytes(response)).toEqual([0, 1]);
    expect(bucket.get).toHaveBeenCalledWith(FILE_KEY, objectContaining({ range: { offset: 0, length: 2 } }));
  });

  it.each([
    ['bytes=95-', 'bytes 95-99/100', [95, 96, 97, 98, 99]],
    ['bytes=-3', 'bytes 97-99/100', [97, 98, 99]],
    ['bytes=98-500', 'bytes 98-99/100', [98, 99]],
  ])('serves %s as %s', async (range, contentRange, expected) => {
    const response = await handleUploads(fileRequest({ Range: range }), apiEnv({ R2_UPLOADS: fakeR2BucketWithRangesAndPreconditions() }));

    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe(contentRange);
    expect(response.headers.get('Content-Length')).toBe(String(expected.length));
    expect(await bodyBytes(response)).toEqual(expected);
  });

  it.each(['bytes=100-', 'bytes=-0'])('rejects the unsatisfiable range %s with 416', async (range) => {
    const response = await handleUploads(fileRequest({ Range: range }), apiEnv({ R2_UPLOADS: fakeR2BucketWithRangesAndPreconditions() }));

    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe(`bytes */${FILE_SIZE}`);
  });

  it.each(['bytes=0-1,4-5', 'bytes=5-2', 'items=0-1', 'bytes=abc'])(
    'ignores the unsupported or invalid range %s and serves the whole file',
    async (range) => {
      const response = await handleUploads(fileRequest({ Range: range }), apiEnv({ R2_UPLOADS: fakeR2BucketWithRangesAndPreconditions() }));

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Range')).toBeNull();
      expect(await bodyBytes(response)).toHaveLength(FILE_SIZE);
    },
  );

  it('serves the whole file when If-Range no longer matches', async () => {
    const bucket = fakeR2BucketWithRangesAndPreconditions();
    const response = await handleUploads(
      fileRequest({ Range: 'bytes=0-1', 'If-Range': '"stale-etag"' }),
      apiEnv({ R2_UPLOADS: bucket }),
    );

    expect(response.status).toBe(200);
    expect(await bodyBytes(response)).toHaveLength(FILE_SIZE);
  });

  it('answers a matching If-None-Match with 304 and no body', async () => {
    const response = await handleUploads(
      fileRequest({ 'If-None-Match': FILE_ETAG }),
      apiEnv({ R2_UPLOADS: fakeR2BucketWithRangesAndPreconditions() }),
    );

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(FILE_ETAG);
    expect(response.body).toBeNull();
  });

  it('answers HEAD from metadata without reading the object', async () => {
    const bucket = fakeR2BucketWithRangesAndPreconditions();
    const response = await handleUploads(fileRequest({}, 'HEAD'), apiEnv({ R2_UPLOADS: bucket }));

    expectTheWholeFileWithRangesAdvertised(response);
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing file, with or without a range', async () => {
    const bucket = fakeR2BucketWithRangesAndPreconditions();
    const missing = new Request('http://localhost/api/uploads/file?key=missing', { headers: { Range: 'bytes=0-1' } });

    expect((await handleUploads(missing, apiEnv({ R2_UPLOADS: bucket }))).status).toBe(404);
  });
});

const SIGNED_IN_USER_ID = 'user-123';
const OTHER_USER_ID = 'user-456';

describe('Uploads Handler delete authorization', () => {
  it('lets an account delete its own avatar', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(SIGNED_IN_USER_ID);
    const env = uploadEnv();

    const response = await handleUploads(deleteRequest(`avatars/${SIGNED_IN_USER_ID}/a.png`), env);

    expect(response.status).toBe(200);
    expect(env.R2_UPLOADS.delete).toHaveBeenCalledWith(`avatars/${SIGNED_IN_USER_ID}/a.png`);
  });

  it.each(['template-files', 'template-images', 'template-videos'])(
    'refuses to delete %s, even for the account that uploaded it, since Templates, versions, Runs and copies may use it',
    async (bucket) => {
      vi.mocked(getSessionUserId).mockResolvedValue(SIGNED_IN_USER_ID);
      const env = uploadEnv();

      const response = await handleUploads(deleteRequest(`${bucket}/${SIGNED_IN_USER_ID}/doc.pdf`), env);

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: 'asset_referenced' });
      expect(env.R2_UPLOADS.delete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['another account avatar', `avatars/${OTHER_USER_ID}/a.png`],
    ['an unknown account avatar', 'avatars/user-999/a.png'],
    ['an avatar key with the caller id after another segment', `avatars/evil/${SIGNED_IN_USER_ID}/a.png`],
    ['a Template image key with the caller id after another segment', `template-images/evil/${SIGNED_IN_USER_ID}/a.png`],
    ['a key in another bucket', `other-bucket/${SIGNED_IN_USER_ID}/a.png`],
    ['a key with the caller id smuggled in', `template-files/${OTHER_USER_ID}/a.pdf/${SIGNED_IN_USER_ID}/x`],
    ['an extra path segment', `avatars/${SIGNED_IN_USER_ID}/nested/a.png`],
    ['an unknown bucket', `x/${SIGNED_IN_USER_ID}/y`],
    ['a key with no file name', `avatars/${SIGNED_IN_USER_ID}/`],
    ['a key with no bucket', `${SIGNED_IN_USER_ID}/a.png`],
  ])('refuses to delete %s', async (_label, key) => {
    vi.mocked(getSessionUserId).mockResolvedValue(SIGNED_IN_USER_ID);
    const env = uploadEnv();

    const response = await handleUploads(deleteRequest(key), env);

    expect(response.status).toBe(403);
    expect(env.R2_UPLOADS.delete).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    vi.mocked(getSessionUserId).mockResolvedValue(null);
    const env = uploadEnv();

    const response = await handleUploads(deleteRequest(`avatars/${SIGNED_IN_USER_ID}/a.png`), env);

    expect(response.status).toBe(401);
    expect(env.R2_UPLOADS.delete).not.toHaveBeenCalled();
  });
});
