import { afterEach, describe, expect, it, vi } from 'vitest';

import { getLocalStorage, safeLocalStorage } from '@/lib/browserStorage';

const stubWindow = (localStorage: () => unknown) => {
  const windowStub = {};
  Object.defineProperty(windowStub, 'localStorage', { configurable: true, get: localStorage });
  vi.stubGlobal('window', windowStub);
};

const mapStorage = (options: { failWrites?: boolean } = {}) => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      if (options.failWrites) throw new DOMException('full', 'QuotaExceededError');
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
};

describe('browser storage', () => {
  afterEach(() => {
    safeLocalStorage.removeItem('test-key');
    vi.unstubAllGlobals();
  });

  it('has no storage outside the browser', () => {
    vi.stubGlobal('window', undefined);
    expect(getLocalStorage()).toBeUndefined();
  });

  it('keeps values in memory when reading localStorage throws', () => {
    stubWindow(() => {
      throw new DOMException('Access is denied for this document.', 'SecurityError');
    });

    expect(getLocalStorage()).toBeUndefined();
    expect(safeLocalStorage.getItem('test-key')).toBeNull();
    safeLocalStorage.setItem('test-key', 'dark');
    expect(safeLocalStorage.getItem('test-key')).toBe('dark');
    safeLocalStorage.removeItem('test-key');
    expect(safeLocalStorage.getItem('test-key')).toBeNull();
  });

  it('keeps a value that could not be persisted, then persists the next write that fits', () => {
    const full = mapStorage({ failWrites: true });
    stubWindow(() => full);

    expect(() => safeLocalStorage.setItem('test-key', 'list')).not.toThrow();
    expect(safeLocalStorage.getItem('test-key')).toBe('list');

    const working = mapStorage();
    stubWindow(() => working);
    safeLocalStorage.setItem('test-key', 'grid');
    expect(working.values.get('test-key')).toBe('grid');
    working.values.set('test-key', 'list');
    expect(safeLocalStorage.getItem('test-key')).toBe('list');
  });

  it('returns null when getItem itself throws', () => {
    stubWindow(() => ({
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    }));

    expect(safeLocalStorage.getItem('test-key')).toBeNull();
  });
});
