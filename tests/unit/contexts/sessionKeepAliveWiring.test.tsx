import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { settle } from '../../support/queryHookProbe';

const { getSession, keepAlive, signOut, startSessionKeepAlive, stopKeepAlive, withoutBrowserListeners } = vi.hoisted(() => ({
  getSession: vi.fn(),
  keepAlive: vi.fn(),
  signOut: vi.fn(),
  startSessionKeepAlive: vi.fn(),
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

vi.mock('@/contexts/sessionSync', async (importOriginal) => {
  const realSessionSync = await importOriginal<typeof import('@/contexts/sessionSync')>();
  return {
    ...realSessionSync,
    createSessionSync: (...args: Parameters<typeof realSessionSync.createSessionSync>) => ({
      ...realSessionSync.createSessionSync(...args),
      keepAlive,
    }),
    browserSessionSyncEnvironment: () => withoutBrowserListeners,
    startSessionKeepAlive,
  };
});

import { AuthProvider, useAuth } from '@/contexts/CloudflareAuthContext';

let restoreGlobals: () => void = () => {};
beforeAll(() => {
  restoreGlobals = installFakeDomGlobals();
});
afterAll(() => restoreGlobals());

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.clearAllMocks();
});

async function mountAuth() {
  let auth: ReturnType<typeof useAuth> | undefined;
  function Probe() {
    auth = useAuth();
    return null;
  }
  root = createRoot(createFakeContainer() as unknown as Element);
  await act(async () => {
    root?.render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
    await settle();
  });
  return () => {
    if (!auth) throw new Error('AuthProvider did not render');
    return auth;
  };
}

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
    const [startedWith] = startSessionKeepAlive.mock.calls[0] as [() => unknown];
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
