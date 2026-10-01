import type { Env } from '../types';
import { resolveTrustedOrigins } from './cors';
import { authJsonError } from './response';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function mediaType(contentType: string | null): string {
  return (contentType ?? '').split(';')[0].trim().toLowerCase();
}

export function rejectUnsafeAuthRequest(request: Request, env: Env): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;

  if (mediaType(request.headers.get('Content-Type')) !== 'application/json') {
    return authJsonError('Auth requests must send a JSON body.', 415, { code: 'unsupported_media_type' });
  }

  const origin = request.headers.get('Origin');
  if (origin !== null) {
    if (!resolveTrustedOrigins(request, env).has(origin)) {
      return authJsonError('Origin not allowed', 403, { code: 'origin_not_allowed' });
    }
  } else if (request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return authJsonError('Cross-site request not allowed', 403, { code: 'origin_not_allowed' });
  }

  return null;
}
