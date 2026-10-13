import type { Env } from '../types';
import { resolveTrustedOrigins } from './cors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type CrossSiteRefusal = 'unsupported_media_type' | 'origin_not_allowed';

function mediaType(contentType: string | null): string {
  return ((contentType ?? '').split(';')[0] ?? '').trim().toLowerCase();
}

export function crossSiteJsonRefusal(request: Request, env: Env): CrossSiteRefusal | null {
  if (SAFE_METHODS.has(request.method)) return null;
  if (mediaType(request.headers.get('Content-Type')) !== 'application/json') return 'unsupported_media_type';

  const origin = request.headers.get('Origin');
  if (origin !== null) return resolveTrustedOrigins(request, env).has(origin) ? null : 'origin_not_allowed';
  return request.headers.get('Sec-Fetch-Site') === 'cross-site' ? 'origin_not_allowed' : null;
}
