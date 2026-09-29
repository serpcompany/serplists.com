// The only module that touches window.localStorage and window.sessionStorage (ESLint
// enforces this). When a browser
// blocks site data, reading the property itself throws a SecurityError, and setItem can
// throw QuotaExceededError, so every access is guarded. Values that cannot be persisted
// are kept in memory, so a choice such as the theme still holds for the session.

export type StringStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Keys whose last write could not be persisted, with the value that was written. The server
// renders client components too: it has no storage, and anything kept in this module there
// would be shared by every visitor, so on the server nothing is read or kept.
const unpersisted = new Map<string, string>();
const onServer = () => typeof window === 'undefined';

export const getLocalStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
};

// Session storage fails the same way. Undefined when it cannot be read; its methods can
// still throw (a full quota), so callers guard them.
export const getSessionStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage ?? undefined;
  } catch {
    return undefined;
  }
};

export const safeLocalStorage: StringStorage = {
  getItem(key) {
    if (onServer()) return null;
    if (unpersisted.has(key)) return unpersisted.get(key) ?? null;
    try {
      return getLocalStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (onServer()) return;
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
