import { useSyncExternalStore } from 'react';

import { getLocalStorage, safeLocalStorage, succeedsWithoutThrowing } from '@/lib/browserStorage';

export const THEME_STORAGE_KEY = 'serplists-theme';
export const THEME_CHANGE_EVENT = 'serplists-theme-change';

export type SerpListsTheme = 'light' | 'dark';

const isTheme = (value: unknown): value is SerpListsTheme =>
  value === 'light' || value === 'dark';

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
  succeedsWithoutThrowing(() => storage?.setItem(THEME_STORAGE_KEY, theme));
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

const isThemeOrClearedKey = (key: string | null): boolean => key === null || key === THEME_STORAGE_KEY;

const isFromAnotherStorageArea = (event: ThemeStorageEvent, localStorageArea: unknown): boolean =>
  Boolean(event.storageArea && localStorageArea && event.storageArea !== localStorageArea);

export const syncThemeFromStorageEvent = (
  event: ThemeStorageEvent,
  documentRef: Document = document,
  storage: Pick<Storage, 'getItem'> | null | undefined = safeLocalStorage,
  localStorageArea: unknown = getLocalStorage(),
): SerpListsTheme | null => {
  if (!isThemeOrClearedKey(event.key) || isFromAnotherStorageArea(event, localStorageArea)) return null;
  return applyStoredTheme(documentRef, storage);
};

interface ThemeSubscriptionOptions {
  documentRef?: Document;
  localStorageArea?: unknown;
  storage?: Pick<Storage, 'getItem'> | null;
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;
}

export const subscribeToThemeChanges = (
  onChange: (theme: SerpListsTheme) => void,
  options: ThemeSubscriptionOptions = {},
): (() => void) => {
  const documentRef = options.documentRef ?? document;
  const target = options.target ?? window;

  const handleThemeChange = (event: Event) => {
    const detail: unknown = event instanceof CustomEvent ? event.detail : undefined;
    onChange(isTheme(detail) ? detail : getDocumentTheme(documentRef));
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

const subscribeToDocumentTheme = (onStoreChange: () => void) => subscribeToThemeChanges(onStoreChange);
const getClientTheme = (): SerpListsTheme => getDocumentTheme();
const getServerTheme = (): SerpListsTheme => 'light';

export const useDocumentTheme = (): SerpListsTheme =>
  useSyncExternalStore(subscribeToDocumentTheme, getClientTheme, getServerTheme);
