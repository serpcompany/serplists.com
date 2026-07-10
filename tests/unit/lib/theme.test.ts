import { describe, expect, it, vi } from 'vitest';

import {
  applyStoredTheme,
  getDocumentTheme,
  getStoredTheme,
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
