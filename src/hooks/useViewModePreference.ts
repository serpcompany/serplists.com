import { useCallback, useEffect, useMemo, useState } from 'react';

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

const getBrowserStorage = (): Storage | undefined =>
  typeof window === 'undefined' ? undefined : window.localStorage;

export const useViewModePreference = ({
  defaultValue = 'grid',
  surface,
  userId,
}: UseViewModePreferenceOptions): [ViewMode, (value: ViewMode) => void] => {
  const storageKey = useMemo(
    () => buildViewModePreferenceKey(userId, surface),
    [surface, userId],
  );
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    readViewModePreference(getBrowserStorage(), storageKey, defaultValue),
  );

  useEffect(() => {
    setViewModeState(
      readViewModePreference(getBrowserStorage(), storageKey, defaultValue),
    );
  }, [defaultValue, storageKey]);

  const setViewMode = useCallback(
    (value: ViewMode) => {
      setViewModeState(value);
      writeViewModePreference(getBrowserStorage(), storageKey, value);
    },
    [storageKey],
  );

  return [viewMode, setViewMode];
};
