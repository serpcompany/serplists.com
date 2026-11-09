export type ViewMode = 'grid' | 'list';
export type ViewModePreferenceSurface =
  | 'category-templates'
  | 'dashboard-templates';

import { succeedsWithoutThrowing } from '@/lib/browserStorage';

type ViewModeStorage = Pick<Storage, 'getItem' | 'setItem'>;

const VIEW_MODE_PREFERENCE_VERSION = 1;

export const buildViewModePreferenceKey = (
  userId: string | undefined,
  surface: ViewModePreferenceSurface,
): string => {
  const owner = userId?.trim() || 'guest';
  return `serplists:view-mode:v${VIEW_MODE_PREFERENCE_VERSION}:${encodeURIComponent(owner)}:${surface}`;
};

export const readViewModePreference = (
  storage: Pick<ViewModeStorage, 'getItem'> | undefined,
  key: string,
  fallback: ViewMode,
): ViewMode => {
  if (!storage) return fallback;

  try {
    const storedValue = storage.getItem(key);
    return storedValue === 'grid' || storedValue === 'list'
      ? storedValue
      : fallback;
  } catch {
    return fallback;
  }
};

export const writeViewModePreference = (
  storage: Pick<ViewModeStorage, 'setItem'> | undefined,
  key: string,
  value: ViewMode,
): void => {
  if (!storage) return;
  succeedsWithoutThrowing(() => storage.setItem(key, value));
};
