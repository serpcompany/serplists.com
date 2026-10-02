import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createFakeContainer, installFakeDomGlobals } from '../../fixtures/fakeDom';
import { settle } from '../../support/queryHookProbe';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('@/lib/auth-client', () => ({
  authClient: { signIn: { email: vi.fn() }, signUp: { email: vi.fn() }, getSession, signOut: vi.fn() },
}));

vi.mock('@/contexts/authSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/authSession')>();
  return {
    ...actual,
    checkSessionWithRetry: (read: Parameters<typeof actual.checkSessionWithRetry>[0]) =>
      actual.checkSessionWithRetry(read, { retryDelaysMs: [] }),
  };
});

vi.mock('@/contexts/sessionSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/contexts/sessionSync')>();
  const stopNothing = () => () => undefined;
  return {
    ...actual,
    startSessionKeepAlive: stopNothing,
    browserSessionSyncEnvironment: () => ({
      openChannel: () => null,
      writeStorage: () => undefined,
      onStorage: stopNothing,
      onVisible: stopNothing,
      onRestored: stopNothing,
      onUnauthorized: stopNothing,
    }),
  };
});

import { AuthProvider, useAuth } from '@/contexts/CloudflareAuthContext';

const windowListeners = new Map<string, Set<() => void>>();
const browserWindow = {
  addEventListener: (type: string, listener: () => void) => {
    windowListeners.set(type, (windowListeners.get(type) ?? new Set()).add(listener));
  },
  removeEventListener: (type: string, listener: () => void) => {
    windowListeners.get(type)?.delete(listener);
  },
};
const comeBackOnline = () => windowListeners.get('online')?.forEach((listener) => listener());

const signedInSession = {
  data: { user: { id: 'user-1', email: 'person@example.com', username: 'person' }, session: {} },
  error: null,
};
const serverDown = { data: null, error: { status: 503 } };

let restoreGlobals: () => void = () => undefined;
let root: Root | null = null;

beforeAll(() => {
  restoreGlobals = installFakeDomGlobals(browserWindow);
});

afterAll(() => restoreGlobals());

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  windowListeners.clear();
  getSession.mockReset();
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

describe('AuthProvider after the session check failed', () => {
  it('checks the session again when the browser comes back online', async () => {
    getSession.mockResolvedValue(serverDown);
    const auth = await mountAuth();
    expect(auth().sessionStatus).toBe('unavailable');

    getSession.mockResolvedValue(signedInSession);
    await act(async () => {
      comeBackOnline();
      await settle();
    });

    expect(auth().sessionStatus).toBe('authenticated');
    expect(windowListeners.get('online')?.size ?? 0).toBe(0);
  });

  it('does not wait for the browser to come back online once the session is known', async () => {
    getSession.mockResolvedValue(signedInSession);

    await mountAuth();

    expect(windowListeners.get('online')?.size ?? 0).toBe(0);
  });
});
