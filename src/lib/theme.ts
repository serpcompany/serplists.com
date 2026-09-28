import { safeLocalStorage } from '@/lib/browserStorage';

const THEME_STORAGE_KEY = 'serplists-theme';
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
