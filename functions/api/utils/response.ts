export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function jsonError(
  message: string,
  status = 400,
  options?: { code?: string; details?: unknown }
): Response {
  return json({ error: message, code: options?.code, details: options?.details }, status);
}
