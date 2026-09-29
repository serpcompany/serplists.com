/**
 * Rewrites the current history entry's URL without a navigation: the page stays mounted with
 * its state, nothing is fetched, and usePathname and useSearchParams follow the new URL
 * (Next.js integrates the native History API). For one-shot query parameters a page drops
 * once it has read them (tokens, notices) and for filters the page keeps in its URL.
 *
 * `state` stays with this entry, across a reload and Back/Forward, and never enters the URL.
 * It is copied, because Next.js adds its own router state to the object it is given.
 */
export const replaceCurrentUrl = (url: string, state: Record<string, unknown> | null = null): void => {
  window.history.replaceState(state === null ? null : { ...state }, '', url);
};

/** The current page as an in-app path (pathname, query and hash), read when it is called. */
export const currentLocationPath = (): string =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;
