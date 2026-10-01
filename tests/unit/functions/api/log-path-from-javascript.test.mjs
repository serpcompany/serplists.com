import { describe, expect, it } from 'vitest';

import { sanitizeLogPath } from '../../../../functions/api/utils/log-path';

describe('sanitizeLogPath called from JavaScript, where no type rules out a path that is not a string', () => {
  it('returns an empty string for a non-string value', () => {
    expect(sanitizeLogPath(undefined)).toBe('');
  });
});
