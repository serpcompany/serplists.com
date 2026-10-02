export async function readBodyWithinLimit(
  body: ReadableStream<unknown>,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return concatenated(chunks, total);
      const chunk = bytesOf(value);
      total += chunk.byteLength;
      if (total > maxBytes) return null;
      chunks.push(chunk);
    }
  } finally {
    cancelWithoutWaiting(reader);
  }
}

function bytesOf(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array) return chunk;
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  throw new TypeError("A body stream gave a chunk that is not bytes");
}

function concatenated(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function cancelWithoutWaiting(reader: ReadableStreamDefaultReader<unknown>): void {
  reader.cancel().catch(() => undefined);
}
