import { useCallback, useSyncExternalStore } from 'react';

import { safeLocalStorage } from '@/lib/browserStorage';
import {
  buildViewModePreferenceKey,
  readViewModePreference,
  type ViewMode,
  type ViewModePreferenceSurface,
  writeViewModePreference,
} from '@/lib/viewModePreference';

type UseViewModePreferenceOptions = {
  defaultValue?: ViewMode;
  surface: ViewModePreferenceSurface;
  userId?: string;
};

// Reading window.localStorage throws when site data is blocked; safeLocalStorage never does
// (a choice it cannot persist is kept in memory for the session).
const getBrowserStorage = () => safeLocalStorage;

// A choice made here updates every component that shows the same preference.
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useViewModePreference = ({
  defaultValue = 'grid',
  surface,
  userId,
}: UseViewModePreferenceOptions): [ViewMode, (value: ViewMode) => void] => {
  const storageKey = buildViewModePreferenceKey(userId, surface);
  // The server has no storage, so its render (and hydration) uses the default and the stored
  // choice follows right after.
  const viewMode = useSyncExternalStore(
    subscribe,
    () => readViewModePreference(getBrowserStorage(), storageKey, defaultValue),
    () => defaultValue,
  );

  const setViewMode = useCallback(
    (value: ViewMode) => {
      writeViewModePreference(getBrowserStorage(), storageKey, value);
      listeners.forEach((listener) => listener());
    },
    [storageKey],
  );

  return [viewMode, setViewMode];
};
