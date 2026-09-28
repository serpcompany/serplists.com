import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { signOutAndLeave } from '@/features/auth/signOut';

describe('signOutAndLeave', () => {
  it('leaves the page once the server signed the user out', async () => {
    const onSignedOut = vi.fn();
    const onError = vi.fn();

    await expect(
      signOutAndLeave({ logout: async () => ({ ok: true }), onSignedOut, onError }),
    ).resolves.toBe(true);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('stays on the page and shows the error when sign-out failed', async () => {
    const onSignedOut = vi.fn();
    const onError = vi.fn();

    await expect(
      signOutAndLeave({
        logout: async () => ({ ok: false, error: 'Sign out failed. Check your connection and try again.' }),
        onSignedOut,
        onError,
      }),
    ).resolves.toBe(false);
    expect(onSignedOut).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Sign out failed. Check your connection and try again.');
  });

  it('is what every sign-out control uses, so none navigates before the server answers', () => {
    const srcRoot = path.resolve(__dirname, '../../../../src');
    for (const file of ['components/Layout.tsx', 'components/DevLoginBar.tsx']) {
      const source = readFileSync(path.join(srcRoot, file), 'utf8');
      expect(source, file).toContain('signOutAndLeave(');
      expect(source, file).not.toMatch(/^\s*logout\(\);/m);
    }
  });
});
