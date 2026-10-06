export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export function jsonError(
  message: string,
  status = 400,
  options?: { code?: string | undefined; details?: unknown }
): Response {
  return json({ error: message, code: options?.code, details: options?.details }, status);
}

export function authJsonError(
  message: string,
  status: number,
  options?: { code?: string; retryAfterSeconds?: number }
): Response {
  const response = json(
    { message, error: message, code: options?.code, retryAfterSeconds: options?.retryAfterSeconds },
    status
  );
  if (options?.retryAfterSeconds !== undefined) {
    response.headers.set('Retry-After', String(options.retryAfterSeconds));
  }
  return response;
}
