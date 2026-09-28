import { getLocalStorage, safeLocalStorage } from '@/lib/browserStorage';

// index.html's boot script reads the same key.
export const THEME_STORAGE_KEY = 'serplists-theme';
export const THEME_CHANGE_EVENT = 'serplists-theme-change';

export type SerpListsTheme = 'light' | 'dark';

const isTheme = (value: string | null): value is SerpListsTheme =>
  value === 'light' || value === 'dark';

// Storage defaults to safeLocalStorage, which never throws. Injected storage is guarded
// too: a theme read or write must never take the page down.
export const getStoredTheme = (
  storage: Pick<Storage, 'getItem'> | null | undefined = safeLocalStorage,
): SerpListsTheme => {
  let storedTheme: string | null = null;
  try {
    storedTheme = storage?.getItem(THEME_STORAGE_KEY) ?? null;
  } catch {
    storedTheme = null;
  }
  return isTheme(storedTheme) ? storedTheme : 'light';
};

export const getDocumentTheme = (
  documentRef: Document = document,
): SerpListsTheme =>
  documentRef.documentElement.classList.contains('dark') ||
  documentRef.body.classList.contains('dark')
    ? 'dark'
    : 'light';

const setDocumentTheme = (documentRef: Document, theme: SerpListsTheme) => {
  const isDark = theme === 'dark';
  documentRef.documentElement.classList.toggle('dark', isDark);
  documentRef.body.classList.toggle('dark', isDark);
};

export const applyStoredTheme = (
  documentRef: Document = document,
  storage: Pick<Storage, 'getItem'> | null | undefined = safeLocalStorage,
): SerpListsTheme => {
  const theme = getStoredTheme(storage);
  setDocumentTheme(documentRef, theme);
  return theme;
};

export const setStoredTheme = (
  theme: SerpListsTheme,
  documentRef: Document = document,
  storage: Pick<Storage, 'setItem'> | null | undefined = safeLocalStorage,
): SerpListsTheme => {
  setDocumentTheme(documentRef, theme);
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisted; the document and every listener below still switch.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<SerpListsTheme>(THEME_CHANGE_EVENT, { detail: theme }),
    );
  }
  return theme;
};

export const toggleDocumentTheme = (
  documentRef: Document = document,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined = safeLocalStorage,
): SerpListsTheme => {
  const nextTheme = getDocumentTheme(documentRef) === 'dark' ? 'light' : 'dark';
  return setStoredTheme(nextTheme, documentRef, storage);
};

type ThemeStorageEvent = { key: string | null; storageArea: unknown };

const readStorageEvent = (event: Event): ThemeStorageEvent | null => {
  if (!('key' in event) || !('storageArea' in event)) return null;
  const { key, storageArea } = event;
  return key === null || typeof key === 'string' ? { key, storageArea } : null;
};

/**
 * Another tab wrote the theme (or cleared storage, which sends a null key). Apply the
 * stored theme to this document and return it, or return null for an unrelated event.
 * Never writes storage, so tabs cannot bounce events back and forth.
 */
export const syncThemeFromStorageEvent = (
  event: ThemeStorageEvent,
  documentRef: Document = document,
  storage: Pick<Storage, 'getItem'> | null | undefined = safeLocalStorage,
  localStorageArea: unknown = getLocalStorage(),
): SerpListsTheme | null => {
  if (event.key !== null && event.key !== THEME_STORAGE_KEY) return null;
  // sessionStorage writes fire the same event.
  if (event.storageArea && localStorageArea && event.storageArea !== localStorageArea) {
    return null;
  }
  return applyStoredTheme(documentRef, storage);
};

interface ThemeSubscriptionOptions {
  documentRef?: Document;
  localStorageArea?: unknown;
  storage?: Pick<Storage, 'getItem'> | null;
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

/**
 * Calls onChange with the theme whenever this tab or another one changes it. A change
 * from another tab is applied to this document first, so whatever the subscriber shows
 * (a toggle label, the toast theme) always matches the page. Returns the unsubscribe.
 */
export const subscribeToThemeChanges = (
  onChange: (theme: SerpListsTheme) => void,
  options: ThemeSubscriptionOptions = {},
): (() => void) => {
  const documentRef = options.documentRef ?? document;
  const target = options.target ?? window;

  const handleThemeChange = (event: Event) => {
    onChange(
      event instanceof CustomEvent && isTheme(event.detail)
        ? event.detail
        : getDocumentTheme(documentRef),
    );
  };
  const handleStorage = (event: Event) => {
    const storageEvent = readStorageEvent(event);
    if (!storageEvent) return;
    const theme = syncThemeFromStorageEvent(
      storageEvent,
      documentRef,
      options.storage ?? safeLocalStorage,
      'localStorageArea' in options ? options.localStorageArea : getLocalStorage(),
    );
    if (theme) onChange(theme);
  };

  target.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
  target.addEventListener('storage', handleStorage);
  return () => {
    target.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    target.removeEventListener('storage', handleStorage);
  };
};
