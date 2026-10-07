import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyTextToClipboard } from '@/lib/clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyTextToClipboard', () => {
  it('reports success when the browser accepts the write', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('https://example.com/share/1')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.com/share/1');
  });

  it('returns false instead of throwing when the browser rejects the write (Safari after a request)', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('The request is not allowed by the user agent')) },
    });

    await expect(copyTextToClipboard('https://example.com/share/1')).resolves.toBe(false);
  });

  it('returns false when there is no clipboard (insecure context)', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyTextToClipboard('https://example.com/share/1')).resolves.toBe(false);
  });
});
