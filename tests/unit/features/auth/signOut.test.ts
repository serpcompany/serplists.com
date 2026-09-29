import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { signOutAndLeave, signOutAndReturn } from '@/features/auth/signOut';

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

// Switching accounts from a page (such as an invite for another email) signs
// out and opens the login page with a way back. The login page sends a
// signed-in visitor straight to the return path, so it must only open once the
// old session is gone.

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('signOutAndReturn', () => {
  it('opens the login page only after sign-out finishes, carrying the return path', async () => {
    const logout = deferred<{ ok: boolean }>();
    const navigate = vi.fn();

    const switching = signOutAndReturn({
      logout: () => logout.promise,
      navigate,
      returnPath: '/team-invites/invite-token/',
      onError: vi.fn(),
    });
    await Promise.resolve();

    expect(navigate).not.toHaveBeenCalled();

    logout.resolve({ ok: true });
    await expect(switching).resolves.toBe(true);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login/?next=%2Fteam-invites%2Finvite-token%2F');
  });

  it('keeps the query and hash of the return path', async () => {
    const navigate = vi.fn();

    await signOutAndReturn({
      logout: async () => ({ ok: true }),
      navigate,
      returnPath: '/team-invites/invite-token/?ref=email#join',
      onError: vi.fn(),
    });

    expect(navigate).toHaveBeenCalledWith(
      '/login/?next=%2Fteam-invites%2Finvite-token%2F%3Fref%3Demail%23join',
    );
  });

  it('stays on the page with the error when the server did not sign the user out', async () => {
    const navigate = vi.fn();
    const onError = vi.fn();

    await expect(
      signOutAndReturn({
        logout: async () => ({ ok: false, error: 'Sign out failed: too many requests.' }),
        navigate,
        returnPath: '/team-invites/invite-token/',
        onError,
      }),
    ).resolves.toBe(false);

    expect(navigate).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Sign out failed: too many requests.');
  });
});
