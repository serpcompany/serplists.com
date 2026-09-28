import { describe, it, expect, vi } from 'vitest';
import { handleUploads } from '@functions/api/handlers/uploads';
import { AVATAR_MIME_TYPES } from '@/lib/schemas/uploadTypes';

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

      expect(response.status).toBe(409);
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
