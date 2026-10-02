import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { startSessionKeepAlive as StartSessionKeepAlive } from '@/contexts/sessionSync';
import { firstOf } from '../../support/elements';


const { getSession, keepAlive, signOut, startSessionKeepAlive, stopKeepAlive, withoutBrowserListeners } = vi.hoisted(() => ({
  getSession: vi.fn(),
  keepAlive: vi.fn(),
  signOut: vi.fn(),
  startSessionKeepAlive: vi.fn<typeof StartSessionKeepAlive>(),
  stopKeepAlive: vi.fn(),
  withoutBrowserListeners: {
    openChannel: () => null,
    writeStorage: () => {},
    onStorage: () => () => {},
    onVisible: () => () => {},
    onRestored: () => () => {},
    onUnauthorized: () => () => {},
  },
}));

vi.mock('@/lib/auth-client', () => ({
  authClient: {
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    getSession,
    signOut,
  },
}));

vi.mock('@/contexts/sessionSync', async (importOriginal) =>
  (await import('../../support/sessionSyncModule')).sessionSyncModuleWith(importOriginal, () => ({ keepAlive }), {
    browserSessionSyncEnvironment: () => withoutBrowserListeners,
    startSessionKeepAlive,
  }),
);

import { anAuthProviderForEachTest } from '../../support/authProviderHarness';

afterEach(() => {
  vi.clearAllMocks();
});

const mountAuth = anAuthProviderForEachTest();

describe('AuthProvider session keep-alive, without which a session expires while the user is still active', () => {
  it("starts the session sync's own keepAlive once signed in and stops it on sign-out", async () => {
    startSessionKeepAlive.mockReturnValue(stopKeepAlive);
    getSession.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'person@example.com', username: 'person' }, session: {} },
      error: null,
    });
    signOut.mockResolvedValue({ data: { success: true }, error: null });

    const auth = await mountAuth();
    expect(auth().isAuthenticated).toBe(true);
    expect(startSessionKeepAlive).toHaveBeenCalledTimes(1);
    expect(startSessionKeepAlive).toHaveBeenCalledWith(keepAlive);
    const [startedWith] = firstOf(startSessionKeepAlive.mock.calls);
    startedWith();
    expect(keepAlive).toHaveBeenCalledTimes(1);
    expect(stopKeepAlive).not.toHaveBeenCalled();

    await act(async () => {
      await auth().logout();
    });

    expect(auth().isAuthenticated).toBe(false);
    expect(stopKeepAlive).toHaveBeenCalledTimes(1);
    expect(startSessionKeepAlive).toHaveBeenCalledTimes(1);
  });

  it('never starts it for a signed-out visitor', async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    const auth = await mountAuth();

    expect(auth().sessionStatus).toBe('unauthenticated');
    expect(startSessionKeepAlive).not.toHaveBeenCalled();
  });
});
