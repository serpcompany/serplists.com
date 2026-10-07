import { describe, expect, it, vi } from 'vitest';

import { signOutAndLeave, signOutAndReturn } from '@/features/auth/signOut';

import { deferred } from '../../../support/deferred';

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
});

describe('signOutAndReturn, which switches accounts from a page such as an invite for another email', () => {
  it('opens the login page only after sign-out finishes, since it sends a signed-in visitor straight to the return path it carries', async () => {
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
