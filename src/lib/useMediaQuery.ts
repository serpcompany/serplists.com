import { useSyncExternalStore } from 'react';

type Subscribe = (onStoreChange: () => void) => () => void;

const canMatchMedia = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const stableSubscribeByQuery = new Map<string, Subscribe>();

const stableSubscribe = (query: string): Subscribe => {
  let subscribe = stableSubscribeByQuery.get(query);
  if (!subscribe) {
    subscribe = (onStoreChange) => {
      if (!canMatchMedia()) {
        return () => undefined;
      }
      const media = window.matchMedia(query);
      media.addEventListener('change', onStoreChange);
      return () => media.removeEventListener('change', onStoreChange);
    };
    stableSubscribeByQuery.set(query, subscribe);
  }
  return subscribe;
};

export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    stableSubscribe(query),
    () => (canMatchMedia() ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}
