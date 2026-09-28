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

/**
 * An error the router sends for an /api/auth/* request before Better Auth runs.
 * Better Auth's client hands the UI the parsed body, and the UI reads `message`
 * as Better Auth's own errors send it; `error` keeps the shape the rest of the
 * API uses. The client cannot read response headers from Better Auth's result,
 * so a wait is also sent in the body as `retryAfterSeconds`.
 */
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
