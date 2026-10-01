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
  userId?: string | undefined;
};

const preferenceReaders = new Set<() => void>();
const subscribe = (reader: () => void) => {
  preferenceReaders.add(reader);
  return () => {
    preferenceReaders.delete(reader);
  };
};

export const useViewModePreference = ({
  defaultValue = 'grid',
  surface,
  userId,
}: UseViewModePreferenceOptions): [ViewMode, (value: ViewMode) => void] => {
  const storageKey = buildViewModePreferenceKey(userId, surface);
  const viewMode = useSyncExternalStore(
    subscribe,
    () => readViewModePreference(safeLocalStorage, storageKey, defaultValue),
    () => defaultValue,
  );

  const setViewMode = useCallback(
    (value: ViewMode) => {
      writeViewModePreference(safeLocalStorage, storageKey, value);
      preferenceReaders.forEach((reread) => reread());
    },
    [storageKey],
  );

  return [viewMode, setViewMode];
};
