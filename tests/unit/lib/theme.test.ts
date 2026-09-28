import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyStoredTheme,
  getDocumentTheme,
  getStoredTheme,
  setStoredTheme,
  THEME_CHANGE_EVENT,
  toggleDocumentTheme,
} from '@/lib/theme';

const createThemeHarness = () => {
  const htmlClassNames = new Set<string>();
  const bodyClassNames = new Set<string>();
  const storage = new Map<string, string>();
  const createClassList = (classNames: Set<string>) => ({
    add: vi.fn((value: string) => classNames.add(value)),
    contains: vi.fn((value: string) => classNames.has(value)),
    remove: vi.fn((value: string) => classNames.delete(value)),
    toggle: vi.fn((value: string, force?: boolean) => {
      const nextValue = force ?? !classNames.has(value);
      if (nextValue) {
        classNames.add(value);
      } else {
        classNames.delete(value);
      }
      return nextValue;
    }),
  });
  const bodyClassList = createClassList(bodyClassNames);
  const documentElementClassList = createClassList(htmlClassNames);

  return {
    bodyClassNames,
    document: {
      body: { classList: bodyClassList },
      documentElement: { classList: documentElementClassList },
    } as unknown as Document,
    documentElementClassNames: htmlClassNames,
    isDark: () => htmlClassNames.has('dark') || bodyClassNames.has('dark'),
    storage: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    } as unknown as Storage,
  };
};

describe('theme helpers', () => {
  it('defaults to light mode when no explicit theme is stored', () => {
    const harness = createThemeHarness();

    applyStoredTheme(harness.document, harness.storage);

    expect(getStoredTheme(harness.storage)).toBe('light');
    expect(harness.isDark()).toBe(false);
  });

  it('uses the visible document theme when toggling from a stale or missing stored theme', () => {
    const harness = createThemeHarness();
    harness.documentElementClassNames.add('dark');
    harness.bodyClassNames.add('dark');

    expect(getStoredTheme(harness.storage)).toBe('light');
    expect(getDocumentTheme(harness.document)).toBe('dark');

    expect(toggleDocumentTheme(harness.document, harness.storage)).toBe('light');
    expect(harness.isDark()).toBe(false);
    expect(harness.storage.setItem).toHaveBeenLastCalledWith(
      'serplists-theme',
      'light',
    );
  });

  it('toggles the document dark class and persists the selected theme', () => {
    const harness = createThemeHarness();

    expect(toggleDocumentTheme(harness.document, harness.storage)).toBe('dark');
    expect(harness.isDark()).toBe(true);
    expect(harness.storage.setItem).toHaveBeenLastCalledWith(
      'serplists-theme',
      'dark',
    );

    expect(toggleDocumentTheme(harness.document, harness.storage)).toBe('light');
    expect(harness.isDark()).toBe(false);
    expect(harness.storage.setItem).toHaveBeenLastCalledWith(
      'serplists-theme',
      'light',
    );
  });
});

// Chrome's "Don't allow sites to save data" (or blocked cookies) makes reading
// window.localStorage itself throw, so a default parameter that reads it crashes the app.
const stubWindowWithBlockedStorage = () => {
  const dispatchEvent = vi.fn();
  const windowStub = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent,
  };
  Object.defineProperty(windowStub, 'localStorage', {
    configurable: true,
    get() {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    },
  });
  vi.stubGlobal('window', windowStub);
  return { dispatchEvent };
};

describe('theme helpers when the browser blocks site data', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to light mode instead of throwing', () => {
    stubWindowWithBlockedStorage();
    const harness = createThemeHarness();

    expect(getStoredTheme()).toBe('light');
    expect(applyStoredTheme(harness.document)).toBe('light');
    expect(harness.isDark()).toBe(false);
  });

  it('still toggles, announces and remembers the theme for the session', () => {
    const { dispatchEvent } = stubWindowWithBlockedStorage();
    const harness = createThemeHarness();

    expect(toggleDocumentTheme(harness.document)).toBe('dark');
    expect(harness.isDark()).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: THEME_CHANGE_EVENT, detail: 'dark' }),
    );

    // A component that mounts later re-applies the stored theme; it must not undo the choice.
    expect(applyStoredTheme(harness.document)).toBe('dark');
    expect(harness.isDark()).toBe(true);
    setStoredTheme('light', harness.document);
  });

  it('survives a storage whose reads and writes throw', () => {
    const { dispatchEvent } = stubWindowWithBlockedStorage();
    const harness = createThemeHarness();
    const throwingStorage = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    };

    expect(getStoredTheme(throwingStorage)).toBe('light');
    expect(applyStoredTheme(harness.document, throwingStorage)).toBe('light');
    expect(toggleDocumentTheme(harness.document, throwingStorage)).toBe('dark');
    expect(harness.isDark()).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
