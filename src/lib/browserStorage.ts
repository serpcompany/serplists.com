export type StringStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const unpersistedWrites = new Map<string, string>();
const onServer = () => typeof window === 'undefined';

export const succeedsWithoutThrowing = (storageAccess: () => void): boolean => {
  try {
    storageAccess();
    return true;
  } catch {
    return false;
  }
};

export const getLocalStorage = (): Storage | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
};

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
    if (unpersistedWrites.has(key)) return unpersistedWrites.get(key) ?? null;
    try {
      return getLocalStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (onServer()) return;
    const storage = getLocalStorage();
    if (storage && succeedsWithoutThrowing(() => storage.setItem(key, value))) {
      unpersistedWrites.delete(key);
      return;
    }
    unpersistedWrites.set(key, value);
  },
  removeItem(key) {
    unpersistedWrites.delete(key);
    succeedsWithoutThrowing(() => getLocalStorage()?.removeItem(key));
  },
};
