import type { Env } from '../types';
import { resolveTrustedOrigins } from './cors';
import { jsonError } from './response';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function mediaType(contentType: string | null): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

/**
 * Checks a state-changing request to /api/auth/* before Better Auth sees it.
 * Returns the response to send instead, or null to continue.
 *
 * Better Auth 1.3.4 (through better-call) also parses form-encoded and
 * multipart bodies, and checks Origin only when the request carries cookies. A
 * cross-site HTML form needs no CORS preflight and, with SameSite=Lax session
 * cookies, sends none, so it could sign a visitor into another account (login
 * CSRF) or sign them out. Requiring a JSON body makes any cross-origin caller
 * pass a CORS preflight, and a browser request from an untrusted Origin, or
 * marked cross-site, is refused even without cookies. Requests with neither
 * header (scripts, server-to-server calls) are not browser CSRF and pass.
 */
export function rejectUnsafeAuthRequest(request: Request, env: Env): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;

  if (mediaType(request.headers.get('Content-Type')) !== 'application/json') {
    return jsonError('Auth requests must send a JSON body.', 415);
  }

  const origin = request.headers.get('Origin');
  if (origin !== null) {
    // `Origin: null` (sandboxed frames, some redirects) is never trusted.
    if (!resolveTrustedOrigins(request, env).has(origin)) {
      return jsonError('Origin not allowed', 403);
    }
  } else if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return jsonError('Cross-site request not allowed', 403);
  }

  return null;
}
