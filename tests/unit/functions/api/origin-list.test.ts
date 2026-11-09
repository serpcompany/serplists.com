import { describe, expect, it } from 'vitest';
import { parseAllowedOrigin } from '@functions/api/utils/origin-list';

describe('parseAllowedOrigin', () => {
  it('reads the origin of an http or https address', () => {
    expect(parseAllowedOrigin(' https://serplists.com/path ')).toBe('https://serplists.com');
  });

  it.each([
    ['an empty entry', ''],
    ['an entry of only spaces', '   '],
    ['an address that is not a URL', 'serplists.com'],
  ])('allows no origin for %s', (_label, value) => {
    expect(parseAllowedOrigin(value)).toBeNull();
  });
});
