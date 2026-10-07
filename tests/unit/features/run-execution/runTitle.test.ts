import { describe, expect, it } from 'vitest';

import { isRunTitleChange } from '@/features/run-execution/runTitle';

describe('isRunTitleChange', () => {
  it('is false for the saved title, with or without surrounding spaces', () => {
    expect(isRunTitleChange('Launch checklist', 'Launch checklist')).toBe(false);
    expect(isRunTitleChange('  Launch checklist ', 'Launch checklist')).toBe(false);
  });

  it('is false for an empty title', () => {
    expect(isRunTitleChange('   ', 'Launch checklist')).toBe(false);
  });

  it('is true for a different title', () => {
    expect(isRunTitleChange('Launch v2', 'Launch checklist')).toBe(true);
  });
});
