import { describe, expect, it } from 'vitest';

import {
  buildViewModePreferenceKey,
  readViewModePreference,
  writeViewModePreference,
} from '@/lib/viewModePreference';

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('view mode preferences', () => {
  it('scopes each preference to the user and screen', () => {
    expect(buildViewModePreferenceKey('user-1', 'dashboard-templates')).not.toBe(
      buildViewModePreferenceKey('user-2', 'dashboard-templates'),
    );
    expect(buildViewModePreferenceKey('user-1', 'dashboard-templates')).not.toBe(
      buildViewModePreferenceKey('user-1', 'category-templates'),
    );
  });

  it('round-trips only supported card and row values', () => {
    const storage = createMemoryStorage();
    const key = buildViewModePreferenceKey('user-1', 'dashboard-templates');

    expect(readViewModePreference(storage, key, 'grid')).toBe('grid');
    writeViewModePreference(storage, key, 'list');
    expect(readViewModePreference(storage, key, 'grid')).toBe('list');
    storage.setItem(key, 'unsupported');
    expect(readViewModePreference(storage, key, 'grid')).toBe('grid');
  });
});
