export async function isBodyWithinLimit(request: Request, maxBytes: number): Promise<boolean> {
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
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}

