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

const splitReturnPath = (returnPath: string): { pathname: string; search: string } => {
  const hashStart = returnPath.indexOf('#');
  const withoutHash = hashStart === -1 ? returnPath : returnPath.slice(0, hashStart);
  const queryStart = withoutHash.indexOf('?');
  return queryStart === -1
    ? { pathname: withoutHash, search: '' }
    : { pathname: withoutHash.slice(0, queryStart), search: withoutHash.slice(queryStart) };
};

function isSensitiveReturnPath(value: string): boolean {
  const { pathname, search } = splitReturnPath(value);
  return isSensitiveAnalyticsLocation(pathname, search);
}

const isTagManagerStartEvent = (entry: unknown): boolean =>
  typeof entry === 'object' && entry !== null && 'event' in entry && entry.event === 'gtm.js';

export function isTagManagerLoaded(win: object): boolean {
  const dataLayer: unknown = Reflect.get(win, 'dataLayer');
  return Array.isArray(dataLayer) && dataLayer.some(isTagManagerStartEvent);
}

export function needsFullPageLoad(pathname: string, search: string, win: object): boolean {
  return isSensitiveAnalyticsLocation(pathname, search) && isTagManagerLoaded(win);
}
