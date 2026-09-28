import { describe, expect, it } from 'vitest';
import { isBodyWithinLimit } from '@functions/api/utils/body';

function chunkedRequest(totalBytes: number, chunkBytes = 1024): Request {
  const chunk = new Uint8Array(chunkBytes).fill(0x61);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkBytes, totalBytes - sent);
      controller.enqueue(chunk.subarray(0, size));
      sent += size;
    },
  });
  return new Request('http://localhost/api/templates', { method: 'POST', body, duplex: 'half' } as RequestInit);
}

describe('isBodyWithinLimit', () => {
  it('accepts a body at the limit and leaves the original readable', async () => {
    const request = chunkedRequest(10 * 1024);

    await expect(isBodyWithinLimit(request.clone(), 10 * 1024)).resolves.toBe(true);
    expect((await request.arrayBuffer()).byteLength).toBe(10 * 1024);
  });

  it('settles as soon as a cloned body passes the limit', async () => {
    const request = chunkedRequest(64 * 1024);

    // Cancelling one branch of a cloned body only settles once the other
    // branch is cancelled too, so the check must not wait for it.
    const result = await Promise.race([
      isBodyWithinLimit(request.clone(), 8 * 1024),
      new Promise((resolve) => setTimeout(() => resolve('timed out'), 1000)),
    ]);

    expect(result).toBe(false);
  });

  it('accepts a request without a body', async () => {
    await expect(isBodyWithinLimit(new Request('http://localhost/api/templates'), 1)).resolves.toBe(true);
  });
});
