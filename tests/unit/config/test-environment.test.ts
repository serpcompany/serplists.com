import { describe, expect, it } from 'vitest';

describe('the unit test environment', () => {
  it('runs in UTC, so a date renders the same on every machine and in CI', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
    expect(new Date('2026-01-01T00:30:00Z').getHours()).toBe(0);
  });
});
