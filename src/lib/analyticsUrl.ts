// Decides whether Google Tag Manager may load for a document. Tags in the container read
// location.href when they fire (GA4 sends it as page_location), so a document whose URL
// carries a bearer secret or an email address must never load it: share links, Organization
// invites, password reset links, and any query with a token, email, code or state.
//
// index.html inlines a copy of this rule, because the tag has to be decided before the app
// bundle loads. tests/unit/security/gtmBootstrap.test.ts runs that copy against the same
// locations as this function, so the two cannot drift apart.

const SENSITIVE_PATH = /^\/(share|team-invites|reset-password)(\/|$)/i;
const SENSITIVE_QUERY_KEYS = ['token', 'email', 'code', 'state'];

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

  for (const key of new URLSearchParams(search).keys()) {
    if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
      return true;
    }
  }
  return false;
}

const isTagManagerStartEvent = (entry: unknown): boolean =>
  typeof entry === 'object' && entry !== null && (entry as { event?: unknown }).event === 'gtm.js';

/** The index.html bootstrap pushes the gtm.js event only when it loads the container. */
export function isTagManagerLoaded(win: object): boolean {
  const dataLayer: unknown = Reflect.get(win, 'dataLayer');
  return Array.isArray(dataLayer) && dataLayer.some(isTagManagerStartEvent);
}

/**
 * A client-side navigation to a sensitive location would report its URL to the tags
 * already running in this document. A full page load of it skips them (index.html).
 */
export function needsFullPageLoad(pathname: string, search: string, win: object): boolean {
  return isSensitiveAnalyticsLocation(pathname, search) && isTagManagerLoaded(win);
}
