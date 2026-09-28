// Some API routes carry a bearer secret in the URL path. Logs must never hold
// those secrets, so the router logs this redacted copy of the path instead of
// the raw one (routing still uses the raw path).
//
// - auth/reset-password/<token>: Better Auth's emailed reset link
// - checklists/shared/<shareToken>[/...]: read and write access to a shared Run
// - teams/invites/<rawToken>/accept: an Organization invite (D1 stores only its hash)
//
// teams/invites/pending and teams/invites/pending/<inviteId>/accept carry ids,
// not secrets, and stay as they are.

export const REDACTED_PATH_TOKEN = ':token';

// Segments are compared in lowercase so an odd-cased request is still redacted:
// redacting a path that would not have routed costs nothing.
function sanitizeSegments(segments: string[]): string[] | null {
  const [first, second] = segments.map((segment) => segment.toLowerCase());

  if (first === 'auth' && second === 'reset-password' && segments.length > 2) {
    return [segments[0], segments[1], REDACTED_PATH_TOKEN];
  }

  if (first === 'checklists' && second === 'shared' && segments.length > 2) {
    return [segments[0], segments[1], REDACTED_PATH_TOKEN];
  }

  if (
    first === 'teams' &&
    second === 'invites' &&
    segments.length > 2 &&
    segments[2].toLowerCase() !== 'pending'
  ) {
    return [segments[0], segments[1], REDACTED_PATH_TOKEN, ...segments.slice(3)];
  }

  return null;
}

/**
 * Returns the API path (without the /api/ prefix) with any secret path
 * segment replaced by ':token'. Paths without a secret come back unchanged.
 * Handlers split on '/' and drop empty segments, so the matching does too:
 * extra, leading or trailing slashes cannot move a token past the redaction.
 */
export function sanitizeLogPath(path: string): string {
  if (typeof path !== 'string') return '';
  const segments = path.split('/').filter(Boolean);
  const sanitized = sanitizeSegments(segments);
  return sanitized ? sanitized.join('/') : path;
}
