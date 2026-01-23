import { describe, it, expect, vi } from 'vitest';
import { handleUploads } from '@functions/api/handlers/uploads';
import { generateJWT } from '@functions/api/utils/jwt';

describe('Uploads Handler', () => {
  it('rejects disallowed MIME types for avatars bucket', async () => {
    const userId = 'user-123';
    const JWT_SECRET = 'test-secret';
    const token = await generateJWT(userId, JWT_SECRET);

    const form = new FormData();
    form.set('bucket', 'avatars');
    form.set('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }));

    const request = new Request('http://localhost/api/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    const env: any = {
      JWT_SECRET,
      R2_UPLOADS: { put: vi.fn(), get: vi.fn(), delete: vi.fn() },
    };

    const response = await handleUploads(request, env);
    const data = await response.json();

    expect(response.status).toBe(415);
    expect(data.error).toBe('Unsupported file type for bucket');
    expect(env.R2_UPLOADS.put).not.toHaveBeenCalled();
  });
});

