import { useSyncExternalStore } from 'react';

type Subscribe = (onStoreChange: () => void) => () => void;

// One subscribe function per query, so a re-render never resubscribes.
const subscribers = new Map<string, Subscribe>();

const subscribeTo = (query: string): Subscribe => {
  let subscribe = subscribers.get(query);
  if (!subscribe) {
    subscribe = (onStoreChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined;
      }
      const media = window.matchMedia(query);
      media.addEventListener('change', onStoreChange);
      return () => media.removeEventListener('change', onStoreChange);
    };
    subscribers.set(query, subscribe);
  }
  return subscribe;
};

/**
 * Whether a media query matches, following changes (a rotated phone, a resized window). The
 * server has no viewport, so it renders `serverValue`; a browser without matchMedia gets it
 * too.
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    subscribeTo(query),
    () =>
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query).matches
        : serverValue,
    () => serverValue,
  );
}
