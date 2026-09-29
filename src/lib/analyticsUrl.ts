// Decides whether Google Tag Manager may load for a document. Tags in the container read
// location.href when they fire (GA4 sends it as page_location), so a document whose URL
// carries a bearer secret or an email address must never load it: share links, Organization
// invites, password reset links, any query with a token, email, code or state, and a `next`
// return path (src/lib/auth/returnPath.ts) that points at one of those, such as
// /login?next=%2Fteam-invites%2F<token> after the email verification link.
//
// The root layout inlines a copy of this rule (src/lib/analytics/tagManagerBootstrap.ts),
// because the tag has to be decided before the app bundle loads.
// tests/unit/security/gtmBootstrap.test.ts runs that copy against the same locations as
// this function, so the two cannot drift apart.

const SENSITIVE_PATH = /^\/(share|team-invites|reset-password)(\/|$)/i;
const SENSITIVE_QUERY_KEYS = ['token', 'email', 'code', 'state'];
const RETURN_PATH_KEY = 'next';

const decodePath = (pathname: string): string => {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
};

export function isSensitiveAnalyticsLocation(pathname: string, search: string): boolean {
  const path = decodePath(pathname).replace(/^\/+/, '/');
  if (SENSITIVE_PATH.test(path)) {
    return true;
  }

  for (const [key, value] of new URLSearchParams(search)) {
    const name = key.toLowerCase();
    if (SENSITIVE_QUERY_KEYS.includes(name)) {
      return true;
    }
    if (name === RETURN_PATH_KEY && isSensitiveReturnPath(value)) {
      return true;
    }
  }
  return false;
}

// A return path is an in-app path with its own query (and hash, which is ignored).
function isSensitiveReturnPath(value: string): boolean {
  const withoutHash = value.split('#')[0];
  const queryStart = withoutHash.indexOf('?');
  return queryStart === -1
    ? isSensitiveAnalyticsLocation(withoutHash, '')
    : isSensitiveAnalyticsLocation(withoutHash.slice(0, queryStart), withoutHash.slice(queryStart));
}

const isTagManagerStartEvent = (entry: unknown): boolean =>
  typeof entry === 'object' && entry !== null && (entry as { event?: unknown }).event === 'gtm.js';

/** The Tag Manager bootstrap pushes the gtm.js event only when it loads the container. */
export function isTagManagerLoaded(win: object): boolean {
  const dataLayer: unknown = Reflect.get(win, 'dataLayer');
  return Array.isArray(dataLayer) && dataLayer.some(isTagManagerStartEvent);
}

/**
 * A client-side navigation to a sensitive location would report its URL to the tags
 * already running in this document. A full page load of it skips them (the bootstrap).
 */
export function needsFullPageLoad(pathname: string, search: string, win: object): boolean {
  return isSensitiveAnalyticsLocation(pathname, search) && isTagManagerLoaded(win);
}
