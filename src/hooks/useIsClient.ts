import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False in the server's render and during hydration, true after: for output only the browser
 * can produce, so the server's HTML never differs from the first client render.
 */
export const useIsClient = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
