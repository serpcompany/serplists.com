const THEME_STORAGE_KEY = 'serplists-theme';
export const THEME_CHANGE_EVENT = 'serplists-theme-change';

export type SerpListsTheme = 'light' | 'dark';

const isTheme = (value: string | null): value is SerpListsTheme =>
  value === 'light' || value === 'dark';

export const getStoredTheme = (
  storage: Pick<Storage, 'getItem'> | null | undefined =
    typeof window !== 'undefined' ? window.localStorage : undefined,
): SerpListsTheme => {
  const storedTheme = storage?.getItem(THEME_STORAGE_KEY) ?? null;
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
  storage: Pick<Storage, 'getItem'> | null | undefined =
    typeof window !== 'undefined' ? window.localStorage : undefined,
): SerpListsTheme => {
  const theme = getStoredTheme(storage);
  setDocumentTheme(documentRef, theme);
  return theme;
};

export const setStoredTheme = (
  theme: SerpListsTheme,
  documentRef: Document = document,
  storage:
    | Pick<Storage, 'setItem'>
    | null
    | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): SerpListsTheme => {
  setDocumentTheme(documentRef, theme);
  storage?.setItem(THEME_STORAGE_KEY, theme);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<SerpListsTheme>(THEME_CHANGE_EVENT, { detail: theme }),
    );
  }
  return theme;
};

export const toggleDocumentTheme = (
  documentRef: Document = document,
  storage:
    | Pick<Storage, 'getItem' | 'setItem'>
    | null
    | undefined = typeof window !== 'undefined' ? window.localStorage : undefined,
): SerpListsTheme => {
  const nextTheme = getDocumentTheme(documentRef) === 'dark' ? 'light' : 'dark';
  return setStoredTheme(nextTheme, documentRef, storage);
};
