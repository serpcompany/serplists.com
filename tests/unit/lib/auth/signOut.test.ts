import { describe, expect, it, vi } from 'vitest';

import { endSession, signOutAndReturn } from '@/lib/auth/signOut';

// Switching accounts from a page (such as an invite for another email) signs
// out and opens the login page with a way back. The login page sends a
// signed-in visitor straight to the return path, so it must only open once the
// old session is gone.

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('endSession', () => {
  it('resolves only after the server sign-out settles and the local session is cleared', async () => {
    const signOut = deferred();
    const clearLocalSession = vi.fn();
    let settled = false;

    const ending = endSession(() => signOut.promise, clearLocalSession).then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(clearLocalSession).not.toHaveBeenCalled();

    signOut.resolve();
    await ending;

    expect(clearLocalSession).toHaveBeenCalledTimes(1);
    expect(settled).toBe(true);
  });

  it('still clears the local session, without rejecting, when the server sign-out fails', async () => {
    const clearLocalSession = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      endSession(() => Promise.reject(new Error('offline')), clearLocalSession),
    ).resolves.toBeUndefined();

    expect(clearLocalSession).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});

describe('signOutAndReturn', () => {
  it('opens the login page only after sign-out finishes, carrying the return path', async () => {
    const logout = deferred();
    const navigate = vi.fn();

    const switching = signOutAndReturn({
      logout: () => logout.promise,
      navigate,
      returnPath: '/team-invites/invite-token',
    });
    await Promise.resolve();

    expect(navigate).not.toHaveBeenCalled();

    logout.resolve();
    await switching;

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login?next=%2Fteam-invites%2Finvite-token', {
      state: { from: '/team-invites/invite-token' },
    });
  });

  it('keeps the query and hash of the return path', async () => {
    const navigate = vi.fn();

    await signOutAndReturn({
      logout: async () => {},
      navigate,
      returnPath: '/team-invites/invite-token?ref=email#join',
    });

    expect(navigate).toHaveBeenCalledWith(
      '/login?next=%2Fteam-invites%2Finvite-token%3Fref%3Demail%23join',
      { state: { from: '/team-invites/invite-token?ref=email#join' } },
    );
  });
});
