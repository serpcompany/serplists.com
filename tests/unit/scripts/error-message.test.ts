import { describe, expect, it } from 'vitest';

import { errorMessage } from '../../../scripts/lib/error-message';

describe('errorMessage', () => {
  it("reads an Error's message without its name or stack", () => {
    expect(errorMessage(new TypeError('fetch failed'))).toBe('fetch failed');
  });

  it('reads a thrown value that is not an Error as text, since a callback or a rejected promise can throw anything', async () => {
    const thrown = await Promise.reject<never>('the server went away').catch((reason: unknown) => reason);

    expect(errorMessage(thrown)).toBe('the server went away');
    expect(errorMessage({ code: 'ECONNRESET' })).toBe('[object Object]');
  });
});
