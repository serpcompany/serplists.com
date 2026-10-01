export async function isBodyWithinLimit(request: Pick<Request, 'body'>, maxBytes: number): Promise<boolean> {
  const body = request.body;
  if (!body) return true;

  const reader = body.getReader();
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return true;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) return false;
      }
    }
  } finally {
    cancelWithoutWaiting(reader);
  }
}

function cancelWithoutWaiting(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  reader.cancel().catch(() => undefined);
}
