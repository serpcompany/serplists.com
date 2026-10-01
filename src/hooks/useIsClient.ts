import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

export const useIsClient = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
