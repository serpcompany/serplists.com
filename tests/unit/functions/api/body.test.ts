import { describe, expect, it } from 'vitest';
import { readBodyWithinLimit } from '@functions/api/utils/body';

function chunkedBody(totalBytes: number, chunkBytes = 1024): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkBytes, totalBytes - sent);
      controller.enqueue(new Uint8Array(size).fill(0x61 + (sent / chunkBytes) % 26));
      sent += size;
    },
  });
}

function endlessBody(chunkBytes = 1024): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(chunkBytes));
    },
  });
}

describe('readBodyWithinLimit', () => {
  it('returns every byte of a body at the limit, in order', async () => {
    const bytes = await readBodyWithinLimit(chunkedBody(10 * 1024), 10 * 1024);
    const expected = new Uint8Array(await new Response(chunkedBody(10 * 1024)).arrayBuffer());

    expect(bytes).toEqual(expected);
  });

  it('returns an empty body as no bytes', async () => {
    await expect(readBodyWithinLimit(chunkedBody(0), 1)).resolves.toEqual(new Uint8Array(0));
  });

  it('stops reading as soon as the body passes the limit, so a body that never ends is refused', async () => {
    await expect(readBodyWithinLimit(endlessBody(), 8 * 1024)).resolves.toBeNull();
  });
});
