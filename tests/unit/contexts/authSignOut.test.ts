import { describe, expect, it, vi } from 'vitest';

import { createSignOutRunner, type AuthClientResult } from '@/contexts/authSession';

function logoutAsAuthProviderBuildsIt(signOut: () => Promise<AuthClientResult>) {
  const session = { signedIn: true };
  const signOutMock = vi.fn(signOut);
  const logout = createSignOutRunner(signOutMock, () => {
    session.signedIn = false;
  });
  return { logout, session, signOut: signOutMock };
}

describe('sign out', () => {
  it('clears the session when the server signed the user out', async () => {
    const { logout, session } = logoutAsAuthProviderBuildsIt(async () => ({ data: { success: true }, error: null }));

    await expect(logout()).resolves.toEqual({ ok: true });
    expect(session.signedIn).toBe(false);
  });

  it.each([
    ['rate limited', 429],
    ['a server error', 500],
    ['an origin check', 403],
    ['a dropped connection', 0],
  ])('keeps the user signed in when the request was %s', async (_name, status) => {
    const { logout, session } = logoutAsAuthProviderBuildsIt(async () => ({ data: null, error: { status, message: 'Too many requests' } }));

    const result = await logout();

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sign out/i);
    expect(session.signedIn).toBe(true);
  });

  it('keeps the user signed in, without an unhandled rejection, when the request throws', async () => {
    const { logout, session } = logoutAsAuthProviderBuildsIt(async () => {
      throw new TypeError('Failed to fetch');
    });

    await expect(logout()).resolves.toMatchObject({ ok: false });
    expect(session.signedIn).toBe(true);
  });

  it.each([
    ['no session cookie', { status: 400, code: 'FAILED_TO_GET_SESSION', message: 'Failed to get session' }],
    ['an expired session', { status: 401, message: 'Unauthorized' }],
  ])('treats %s as already signed out', async (_name, error) => {
    const { logout, session } = logoutAsAuthProviderBuildsIt(async () => ({ data: null, error }));

    await expect(logout()).resolves.toEqual({ ok: true });
    expect(session.signedIn).toBe(false);
  });

  it('sends one request for a double click', async () => {
    let finish: () => void = () => {};
    const { logout, signOut } = logoutAsAuthProviderBuildsIt(
      () => new Promise((resolve) => { finish = () => resolve({ data: { success: true }, error: null }); }),
    );

    const first = logout();
    const second = logout();
    finish();

    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
