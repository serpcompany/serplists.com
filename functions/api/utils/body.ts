export async function readBodyWithinLimit(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return concatenated(chunks, total);
      total += value.byteLength;
      if (total > maxBytes) return null;
      chunks.push(value);
    }
  } finally {
    cancelWithoutWaiting(reader);
  }
}

function concatenated(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function cancelWithoutWaiting(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  reader.cancel().catch(() => undefined);
}
