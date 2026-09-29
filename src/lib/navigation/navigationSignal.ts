// Next.js has no location key: a link to the page that is already open changes neither the
// pathname nor the query, so nothing a page reads from the router tells it that the user
// navigated. The app's Link and useAppRouter report every navigation they start here, and
// browser Back/Forward report through popstate, so a page visit (usePageVisit) ends on
// those too, as it did when each React Router navigation got a new location key.
//
// Listeners are added only from effects, so nothing is ever registered on the server.
type NavigationListener = () => void;

const listeners = new Set<NavigationListener>();

/** Calls `listener` whenever the app starts a navigation; returns the unsubscribe. */
export const subscribeToNavigations = (listener: NavigationListener): (() => void) => {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
};

/** Called by the app's Link and useAppRouter when a navigation starts. */
export const reportNavigation = (): void => {
  listeners.forEach((listener) => listener());
};
