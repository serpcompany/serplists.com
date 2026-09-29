import { expect, test } from '@playwright/test';

import { API_BASE_URL as apiBaseUrl } from './support/stack';

// Uploaded videos are served with byte ranges (functions/api/utils/r2-file-response.ts),
// which Safari needs to play them and every browser needs to seek. This runs against
// Miniflare's real R2 binding, so it also catches misuse of the R2 range options.

test('an uploaded video answers byte-range requests with 206', async ({ request }) => {
  const signIn = await request.post(`${apiBaseUrl}/auth/sign-in/email`, {
    data: { email: 'john@test.com', password: 'password123' },
  });
  expect(signIn.status()).toBe(200);

  const bytes = Buffer.from(Array.from({ length: 64 }, (_, index) => index));
  const upload = await request.post(`${apiBaseUrl}/uploads`, {
    multipart: {
      bucket: 'template-videos',
      file: { name: 'range-check.mp4', mimeType: 'video/mp4', buffer: bytes },
    },
  });
  expect(upload.status()).toBe(200);
  const { key } = (await upload.json()) as { key: string };
  const fileUrl = `${apiBaseUrl}/uploads/file?key=${encodeURIComponent(key)}`;

  try {
    const probe = await request.get(fileUrl, { headers: { Range: 'bytes=0-1' } });
    expect(probe.status()).toBe(206);
    expect(probe.headers()['content-range']).toBe('bytes 0-1/64');
    expect(probe.headers()['accept-ranges']).toBe('bytes');
    expect(Array.from(await probe.body())).toEqual([0, 1]);

    const tail = await request.get(fileUrl, { headers: { Range: 'bytes=60-' } });
    expect(tail.status()).toBe(206);
    expect(tail.headers()['content-range']).toBe('bytes 60-63/64');
    expect(Array.from(await tail.body())).toEqual([60, 61, 62, 63]);

    const pastEnd = await request.get(fileUrl, { headers: { Range: 'bytes=64-' } });
    expect(pastEnd.status()).toBe(416);
    expect(pastEnd.headers()['content-range']).toBe('bytes */64');

    const whole = await request.get(fileUrl);
    expect(whole.status()).toBe(200);
    expect(whole.headers()['accept-ranges']).toBe('bytes');
    expect((await whole.body()).length).toBe(64);
  } finally {
    await request.delete(fileUrl);
  }
});
