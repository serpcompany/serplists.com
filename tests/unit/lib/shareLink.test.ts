import { describe, expect, it, vi } from 'vitest';

import { createShareLinkAndCopy } from '@/lib/shareLink';

describe('createShareLinkAndCopy', () => {
  it('keeps the created link when copying fails', async () => {
    const result = await createShareLinkAndCopy(
      async () => 'https://serplists.com/share/token-1',
      vi.fn().mockResolvedValue(false),
    );

    expect(result).toEqual({ kind: 'ok', copied: false, shareUrl: 'https://serplists.com/share/token-1' });
  });

  it('treats a copy that throws as not copied, never as a failed share', async () => {
    const result = await createShareLinkAndCopy(
      async () => 'https://serplists.com/share/token-1',
      vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
    );

    expect(result).toEqual({ kind: 'ok', copied: false, shareUrl: 'https://serplists.com/share/token-1' });
  });

  it('reports the copy when it works', async () => {
    const copy = vi.fn().mockResolvedValue(true);

    await expect(createShareLinkAndCopy(async () => 'https://serplists.com/share/t', copy)).resolves.toEqual({
      kind: 'ok',
      copied: true,
      shareUrl: 'https://serplists.com/share/t',
    });
    expect(copy).toHaveBeenCalledWith('https://serplists.com/share/t');
  });

  it('reports an error only when creating the link fails, with the API message', async () => {
    const copy = vi.fn();

    await expect(createShareLinkAndCopy(async () => { throw new Error('Forbidden'); }, copy)).resolves.toEqual({
      kind: 'error',
      message: 'Forbidden',
    });
    expect(copy).not.toHaveBeenCalled();
  });

  it('does nothing when no link was created (a double click the save queue ignored)', async () => {
    const copy = vi.fn();

    await expect(createShareLinkAndCopy(async () => null, copy)).resolves.toEqual({ kind: 'skipped' });
    expect(copy).not.toHaveBeenCalled();
  });
});
