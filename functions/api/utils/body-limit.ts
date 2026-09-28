import { isBodyWithinLimit } from './body';

const MB = 1024 * 1024;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type BodyLimit = {
  maxBytes: number;
  label: string;
  /**
   * When Content-Length is missing or malformed: 'count' reads a clone of the
   * body and stops past maxBytes; 'require' answers 411 without reading it.
   */
  withoutLength: 'count' | 'require';
};

export type BodyLimitRejection = { status: 411 | 413; error: string };

/**
 * Per-route request body caps, enforced by the router for every method that
 * can carry a body, whatever its Content-Type: handlers call request.json(),
 * which ignores Content-Type, so a header-based rule could be bypassed.
 * `path` is the API path without the `/api/` prefix.
 */
export function requestBodyLimit(path: string): BodyLimit {
  if (path === 'uploads' || path.startsWith('uploads/')) {
    // The 50MB file cap plus room for the multipart envelope. Counting a
    // chunked upload would tee up to 51MB into memory, and the handler's
    // formData() buffers the whole body before it can check the file size, so
    // uploads must declare their length. Browsers always send it for FormData.
    return { maxBytes: 51 * MB, label: '50MB', withoutLength: 'require' };
  }
  if (path.startsWith('templates/backup')) {
    return { maxBytes: 2 * MB, label: '2MB', withoutLength: 'count' };
  }
  if (path === 'auth' || path.startsWith('auth/')) {
    // Sign-in, sign-up and profile bodies are a few hundred bytes. A small cap
    // stops oversized values before Better Auth parses them.
    return { maxBytes: 16 * 1024, label: '16KB', withoutLength: 'count' };
  }
  return { maxBytes: MB, label: '1MB', withoutLength: 'count' };
}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\s*\d+\s*$/.test(value)) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

function tooLarge(limit: BodyLimit): BodyLimitRejection {
  return { status: 413, error: `Payload too large (max ${limit.label})` };
}

/** Returns why the body is refused (411 or 413), or null when it is within its cap. */
export async function checkRequestBodyLimit(request: Request, path: string): Promise<BodyLimitRejection | null> {
  if (!BODY_METHODS.has(request.method) || !request.body) return null;

  const limit = requestBodyLimit(path);
  const declaredBytes = parseContentLength(request.headers.get('Content-Length'));
  if (declaredBytes !== null) {
    return declaredBytes > limit.maxBytes ? tooLarge(limit) : null;
  }
  if (limit.withoutLength === 'require') {
    return { status: 411, error: 'Content-Length required' };
  }

  // The clone buffers at most maxBytes before the count stops reading.
  return (await isBodyWithinLimit(request.clone(), limit.maxBytes)) ? null : tooLarge(limit);
}
