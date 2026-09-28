import { isBodyWithinLimit } from './body';

const MB = 1024 * 1024;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

type BodyLimit = {
  maxBytes: number;
  label: string;
  /** Count streamed bytes when Content-Length is missing or malformed. */
  countStreamedBytes: boolean;
};

/**
 * Per-route request body caps, enforced by the router for every method that
 * can carry a body, whatever its Content-Type: handlers call request.json(),
 * which ignores Content-Type, so a header-based rule could be bypassed.
 * `path` is the API path without the `/api/` prefix.
 */
export function requestBodyLimit(path: string): BodyLimit {
  if (path === 'uploads' || path.startsWith('uploads/')) {
    // The 50MB file cap plus room for the multipart envelope. Counting a
    // chunked upload here would buffer it twice (the clone tees the stream),
    // so uploads without Content-Length are left to the handler, which
    // requires a session before parsing and checks the file size.
    return { maxBytes: 51 * MB, label: '50MB', countStreamedBytes: false };
  }
  if (path.startsWith('templates/backup')) {
    return { maxBytes: 2 * MB, label: '2MB', countStreamedBytes: true };
  }
  if (path === 'auth' || path.startsWith('auth/')) {
    // Sign-in, sign-up and profile bodies are a few hundred bytes. A small cap
    // stops oversized values before Better Auth parses them.
    return { maxBytes: 16 * 1024, label: '16KB', countStreamedBytes: true };
  }
  return { maxBytes: MB, label: '1MB', countStreamedBytes: true };
}

function parseContentLength(value: string | null): number | null {
  if (value === null || !/^\s*\d+\s*$/.test(value)) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) ? bytes : null;
}

/** Returns the size label to report when the body is over its cap, or null when it is within it. */
export async function findOversizedBody(request: Request, path: string): Promise<string | null> {
  if (!BODY_METHODS.has(request.method) || !request.body) return null;

  const limit = requestBodyLimit(path);
  const declaredBytes = parseContentLength(request.headers.get('Content-Length'));
  if (declaredBytes !== null) {
    return declaredBytes > limit.maxBytes ? limit.label : null;
  }
  if (!limit.countStreamedBytes) return null;

  // The clone buffers at most maxBytes before the count stops reading.
  return (await isBodyWithinLimit(request.clone(), limit.maxBytes)) ? null : limit.label;
}
