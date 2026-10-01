import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

import { anAuthProviderForEachTest } from '../../support/authProviderHarness';

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

afterEach(() => {
  windowListeners.clear();
  getSession.mockReset();
});

const mountAuth = anAuthProviderForEachTest(browserWindow);

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
