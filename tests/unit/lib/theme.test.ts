import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyStoredTheme,
  getDocumentTheme,
  getStoredTheme,
  setStoredTheme,
  subscribeToThemeChanges,
  syncThemeFromStorageEvent,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
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
    storedValues: storage,
  };
};

const expectAToggleTo = (harness: ReturnType<typeof createThemeHarness>, theme: 'light' | 'dark') => {
  expect(toggleDocumentTheme(harness.document, harness.storage)).toBe(theme);
  expect(harness.isDark()).toBe(theme === 'dark');
  expect(harness.storage.setItem).toHaveBeenLastCalledWith('serplists-theme', theme);
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

    expectAToggleTo(harness, 'light');
  });

  it('toggles the document dark class and persists the selected theme', () => {
    const harness = createThemeHarness();

    expectAToggleTo(harness, 'dark');

    expectAToggleTo(harness, 'light');
  });
});

const stubWindowWhereReadingLocalStorageThrows = () => {
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
    stubWindowWhereReadingLocalStorageThrows();
    const harness = createThemeHarness();

    expect(getStoredTheme()).toBe('light');
    expect(applyStoredTheme(harness.document)).toBe('light');
    expect(harness.isDark()).toBe(false);
  });

  it('still toggles, announces and remembers the theme for the session, so a component that mounts later and applies the stored theme keeps the choice', () => {
    const { dispatchEvent } = stubWindowWhereReadingLocalStorageThrows();
    const harness = createThemeHarness();

    expect(toggleDocumentTheme(harness.document)).toBe('dark');
    expect(harness.isDark()).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: THEME_CHANGE_EVENT, detail: 'dark' }),
    );

    expect(applyStoredTheme(harness.document)).toBe('dark');
    expect(harness.isDark()).toBe(true);
    setStoredTheme('light', harness.document);
  });

  it('survives a storage whose reads and writes throw', () => {
    const { dispatchEvent } = stubWindowWhereReadingLocalStorageThrows();
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

describe('theme changes from another tab, which arrive only as a storage event and must reach this document so its labels agree with the page', () => {
  const storageEvent = (key: string | null, storageArea: unknown) =>
    Object.assign(new Event('storage'), { key, storageArea });

  it('applies a theme another tab stored to this document', () => {
    const harness = createThemeHarness();
    harness.storedValues.set(THEME_STORAGE_KEY, 'dark');

    expect(
      syncThemeFromStorageEvent(
        { key: THEME_STORAGE_KEY, storageArea: harness.storage },
        harness.document,
        harness.storage,
        harness.storage,
      ),
    ).toBe('dark');
    expect(harness.isDark()).toBe(true);
    expect(getDocumentTheme(harness.document)).toBe('dark');
  });

  it("applies another tab's theme without writing it back, so tabs never echo a change to each other", () => {
    const harness = createThemeHarness();
    harness.storedValues.set(THEME_STORAGE_KEY, 'dark');

    syncThemeFromStorageEvent(
      { key: THEME_STORAGE_KEY, storageArea: harness.storage },
      harness.document,
      harness.storage,
      harness.storage,
    );

    expect(harness.storage.setItem).not.toHaveBeenCalled();
  });

  it('ignores other keys and sessionStorage', () => {
    const harness = createThemeHarness();
    harness.storedValues.set(THEME_STORAGE_KEY, 'dark');
    const sessionArea = { getItem: () => null } as unknown as Storage;

    expect(
      syncThemeFromStorageEvent(
        { key: 'workspace', storageArea: harness.storage },
        harness.document,
        harness.storage,
        harness.storage,
      ),
    ).toBeNull();
    expect(
      syncThemeFromStorageEvent(
        { key: THEME_STORAGE_KEY, storageArea: sessionArea },
        harness.document,
        harness.storage,
        harness.storage,
      ),
    ).toBeNull();
    expect(harness.isDark()).toBe(false);
  });

  it('falls back to light when another tab clears storage or stores junk', () => {
    const harness = createThemeHarness();
    harness.documentElementClassNames.add('dark');
    harness.bodyClassNames.add('dark');

    expect(
      syncThemeFromStorageEvent(
        { key: null, storageArea: harness.storage },
        harness.document,
        harness.storage,
        harness.storage,
      ),
    ).toBe('light');
    expect(harness.isDark()).toBe(false);

    harness.storedValues.set(THEME_STORAGE_KEY, 'purple');
    harness.documentElementClassNames.add('dark');
    expect(
      syncThemeFromStorageEvent(
        { key: THEME_STORAGE_KEY, storageArea: harness.storage },
        harness.document,
        harness.storage,
        harness.storage,
      ),
    ).toBe('light');
    expect(harness.isDark()).toBe(false);
  });

  it('keeps subscribers and the document in step, and unsubscribes both listeners', () => {
    const harness = createThemeHarness();
    const target = new EventTarget();
    const onChange = vi.fn();
    const unsubscribe = subscribeToThemeChanges(onChange, {
      documentRef: harness.document,
      localStorageArea: harness.storage,
      storage: harness.storage,
      target,
    });

    harness.storedValues.set(THEME_STORAGE_KEY, 'dark');
    target.dispatchEvent(storageEvent(THEME_STORAGE_KEY, harness.storage));
    expect(harness.isDark()).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith('dark');

    target.dispatchEvent(storageEvent('unrelated', harness.storage));
    expect(onChange).toHaveBeenCalledTimes(1);

    target.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: 'light' }));
    expect(onChange).toHaveBeenLastCalledWith('light');

    unsubscribe();
    harness.storedValues.set(THEME_STORAGE_KEY, 'light');
    target.dispatchEvent(storageEvent(THEME_STORAGE_KEY, harness.storage));
    target.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: 'dark' }));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(harness.isDark()).toBe(true);
  });

  it('leaves storage listening to theme.ts, so no component updates its label alone', () => {
    const listFiles = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? listFiles(path) : [path];
      });
    const sessionSyncListeningOnlyForItsOwnKey = 'src/contexts/sessionSync.ts';
    const allowed = new Set(['src/lib/theme.ts', sessionSyncListeningOnlyForItsOwnKey]);
    const offenders = listFiles('src')
      .filter((path) => /\.(ts|tsx)$/.test(path))
      .filter((path) => !allowed.has(path.split('\\').join('/')))
      .filter((path) => /addEventListener\(\s*['"]storage['"]/.test(readFileSync(path, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
