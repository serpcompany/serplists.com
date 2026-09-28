// The only module that touches window.localStorage (ESLint enforces this). When a browser
// blocks site data, reading the property itself throws a SecurityError, and setItem can
// throw QuotaExceededError, so every access is guarded. Values that cannot be persisted
// are kept in memory, so a choice such as the theme still holds for the session.

export type StringStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Keys whose last write could not be persisted, with the value that was written.
const unpersisted = new Map<string, string>();

export const getLocalStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
};

export const safeLocalStorage: StringStorage = {
  getItem(key) {
    if (unpersisted.has(key)) return unpersisted.get(key) ?? null;
    try {
      return getLocalStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      const storage = getLocalStorage();
      if (storage) {
        storage.setItem(key, value);
        unpersisted.delete(key);
        return;
      }
    } catch {
      // Blocked or full: fall through to the in-memory copy.
    }
    unpersisted.set(key, value);
  },
  removeItem(key) {
    unpersisted.delete(key);
    try {
      getLocalStorage()?.removeItem(key);
    } catch {
      // Nothing persisted to remove.
    }
  },
};
