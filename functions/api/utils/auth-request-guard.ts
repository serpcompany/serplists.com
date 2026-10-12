import type { Env } from '../types';
import { crossSiteJsonRefusal } from './cross-site-guard';
import { authJsonError } from './response';

export function rejectUnsafeAuthRequest(request: Request, env: Env): Response | null {
  const refusal = crossSiteJsonRefusal(request, env);
  if (refusal === 'unsupported_media_type') {
    return authJsonError('Auth requests must send a JSON body.', 415, { code: refusal });
  }
  if (refusal === 'origin_not_allowed') {
    const message = request.headers.get('Origin') === null ? 'Cross-site request not allowed' : 'Origin not allowed';
    return authJsonError(message, 403, { code: refusal });
  }
  return null;
}
